const schedule = require('node-schedule');
const axios = require('axios');
const moment = require('moment-timezone');
const { config } = require('../shared/config');
const sqlConnector = require('./sql-connector');
const Store = require('electron-store');
const getLogger = require('../shared/logger');
const _ = require('lodash');
const logger = getLogger();

class SyncService {
  constructor(trayManager) {
    this.trayManager = trayManager;
    this.store = new Store();
    this.job = null;
    this.isSyncing = false;
    this.lastSyncTime = this.store.get('lastSyncTime', null);
    this.lastSyncedReceiptDate = this.store.get('lastSyncedReceiptDate', null);
    this.syncQueue = {}; // In-memory queue for receipts to be synced
    this.failedQueue = {}; // In-memory queue for failed receipts (separate from persisted)
    this.syncStats = {
      totalSynced: this.store.get('totalSynced', 0),
      totalFailed: this.store.get('totalFailed', 0),
      lastError: null
    };

    logger.info(`Last synced receipt date: ${this.lastSyncedReceiptDate || 'Never'}`);
  }

  start() {
    if (!config.sync.enabled) {
      logger.info('Sync service is disabled');
      return;
    }

    logger.info(`Starting sync service - interval: ${config.sync.intervalMinutes} minutes`);

    // Run initial sync after 10 seconds
    setTimeout(() => {
      this.runSync();
    }, 10000);

    // Schedule periodic sync
    const intervalMs = config.sync.intervalMinutes * 60 * 1000;
    this.job = schedule.scheduleJob(`*/${config.sync.intervalMinutes} * * * *`, () => {
      this.runSync();
    });

    logger.info('Sync service started');
  }

  stop() {
    if (this.job) {
      this.job.cancel();
      this.job = null;
      logger.info('Sync service stopped');
    }
  }

  async runSync() {
    if (this.isSyncing) {
      logger.info('Sync already in progress, skipping...');
      return;
    }

    this.isSyncing = true;
    this.trayManager.updateStatus('syncing');

    try {
      logger.info('Starting receipt sync...');

      // Retry failed receipts from in-memory queue first
      if (Object.keys(this.failedQueue).length > 0) {
        await this.retryFailedReceipts();
      }

      // Get recent receipts from SQL Server (only receipts after lastSyncedReceiptDate)
      const receipts = await sqlConnector.getRecentReceipts(config.sync.batchSize);

      if (this.lastSyncedReceiptDate) {
        logger.info(`Fetching receipts since: ${this.lastSyncedReceiptDate}`);
      }

      if (receipts.length === 0) {
        this.trayManager.updateStatus('idle');
        this.isSyncing = false;
        return;
      }

      const groupedReceipts = _.groupBy(receipts, 'receiptNo');
      logger.info(`Found ${Object.keys(groupedReceipts).length} receipts to process`);
      // Add receipts to in-memory sync queue
      this.syncQueue = groupedReceipts;

      // Process receipts from queue
      const results = await this.processReceipts();

      // Update statistics
      this.syncStats.totalSynced += results.succeeded;
      this.syncStats.totalFailed += results.failed;
      this.lastSyncTime = new Date().toISOString();

      // Persist stats
      this.store.set('totalSynced', this.syncStats.totalSynced);
      this.store.set('totalFailed', this.syncStats.totalFailed);
      this.store.set('lastSyncTime', this.lastSyncTime);
      this.store.set('lastSyncedReceiptDate', this.lastSyncedReceiptDate);

      logger.info(`Sync completed - Success: ${results.succeeded}, Failed: ${results.failed}`);

      this.trayManager.updateStatus('idle');
      this.trayManager.updateTooltip(
        `Last sync: ${moment(this.lastSyncTime).format('HH:mm:ss')}\n` + `Total synced: ${this.syncStats.totalSynced}`
      );
    } catch (error) {
      logger.error('Sync error:', error);
      this.syncStats.lastError = error.message;
      this.trayManager.updateStatus('error');
      this.trayManager.updateTooltip(`Sync error: ${error.message}`);
    } finally {
      this.isSyncing = false;
      // Clear sync queue after processing
      this.syncQueue = {};
    }
  }

  async processReceipts() {
    const results = { succeeded: 0, failed: 0 };

    while (_.keys(this.syncQueue).length > 0) {
      const receiptNo = _.keys(this.syncQueue)[0];
      const receipts = this.syncQueue[receiptNo];
      try {
        // Get full receipt details
        if (receipts.length > 1) {
          logger.info(`Processing split payments receipt: ${receiptNo}`);
          const topMostReceipt = receipts[0];
          const receiptDetails = await sqlConnector.getItemDetails(topMostReceipt.GUID);
          if (!receiptDetails) {
            logger.warn(`No details found for receipt ${topMostReceipt.receiptNo}`);
            delete this.syncQueue[receiptNo];
            continue;
          }
          const apiPayload = this.transformReceiptData(receiptDetails, receipts);
          await this.sendToReceiptAPI(apiPayload);
          results.succeeded++;
        } else {
          logger.info(`Processing single payment receipt: ${receiptNo}`);
          const receiptDetails = await sqlConnector.getItemDetails(receipts[0].GUID);

          if (!receiptDetails) {
            logger.warn(`No details found for receipt ${receiptNo}`);
            delete this.syncQueue[receiptNo];
            continue;
          }
          const apiPayload = this.transformReceiptData(receiptDetails, receipts);
          await this.sendToReceiptAPI(apiPayload);
          results.succeeded++;
        }

        // Update last synced receipt date
        if (receipts[0].date) {
          const receiptDate = new Date(receipts[0].date);
          if (!this.lastSyncedReceiptDate || receiptDate > new Date(this.lastSyncedReceiptDate)) {
            this.lastSyncedReceiptDate = receiptDate.toISOString();
          }
        }
        delete this.syncQueue[receiptNo];
        logger.info(`✓ Synced receipt: ${receiptNo} (${receipts[0].date})`);
      } catch (error) {
        logger.error(`✗ Failed to sync receipt ${receiptNo}:`, error.message);

        // Add to in-memory failed queue (grouped by receiptNo, matching syncQueue structure)
        this.failedQueue[receiptNo] = {
          receipts: receipts, // Store all receipts for this receiptNo (for split payments)
          error: error.message,
          attempts: 1,
          lastAttempt: new Date().toISOString()
        };

        // Remove from syncQueue so we can process the next receipt
        delete this.syncQueue[receiptNo];
        results.failed++;
      }
    }

    return results;
  }

  async retryFailedReceipts() {
    const failedCount = Object.keys(this.failedQueue).length;
    logger.info(`Retrying ${failedCount} failed receipts...`);

    const stillFailed = {};

    for (const receiptNo in this.failedQueue) {
      const failed = this.failedQueue[receiptNo];

      if (failed.attempts >= config.sync.retryAttempts) {
        logger.warn(`Max retries reached for ${receiptNo}, skipping...`);
        stillFailed[receiptNo] = failed;
        continue;
      }

      try {
        const receipts = failed.receipts;
        // Get full receipt details (similar to processReceipts)
        if (receipts.length > 1) {
          logger.info(`Retrying split payments receipt: ${receiptNo}`);
          const topMostReceipt = receipts[0];
          const receiptDetails = await sqlConnector.getItemDetails(topMostReceipt.GUID);
          if (!receiptDetails) {
            logger.warn(`No details found for receipt ${receiptNo}`);
            continue;
          }
          const apiPayload = this.transformReceiptData(receiptDetails, receipts);
          await this.sendToReceiptAPI(apiPayload);
        } else {
          logger.info(`Retrying single payment receipt: ${receiptNo}`);
          const receiptDetails = await sqlConnector.getItemDetails(receipts[0].GUID);
          if (!receiptDetails) {
            logger.warn(`No details found for receipt ${receiptNo}`);
            continue;
          }
          const apiPayload = this.transformReceiptData(receiptDetails, receipts);
          await this.sendToReceiptAPI(apiPayload);
        }

        // Update last synced receipt date
        if (receipts[0].date) {
          const receiptDate = new Date(receipts[0].date);
          if (!this.lastSyncedReceiptDate || receiptDate > new Date(this.lastSyncedReceiptDate)) {
            this.lastSyncedReceiptDate = receiptDate.toISOString();
          }
        }

        logger.info(`✓ Retry successful for ${receiptNo}`);
      } catch (error) {
        // Still failing - increment attempts
        failed.attempts++;
        failed.lastAttempt = new Date().toISOString();
        failed.error = error.message;
        stillFailed[receiptNo] = failed;

        logger.error(`✗ Retry failed for ${receiptNo} (attempt ${failed.attempts})`);
      }
    }

    this.failedQueue = stillFailed;
  }

  transformReceiptData(receiptDetails, receipts) {
    const receipt = receipts[0];
    // Transform items
    const transformedItems = receiptDetails.map((item) => ({
      serialNo: item.serialNo,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discountAmount,
      discountPercentage: item.discountPercentage,
      billDiscount: item.billDiscountAmount,
      netAmount: item.netAmount,
      brand: item.brand,
      category: item.category,
      taxableAmount: item.taxableAmount,
      gstAmount: item.gstAmount
    }));

    // Parse payment details
    const splitPayments = [];
    if (receipts.length > 1) {
      receipts.forEach((r) => {
        const method = r.method;
        const amount = r.amount;
        if (method && amount) {
          splitPayments.push({ method, amount: parseFloat(amount) });
        }
      });
    }

    // Parse GST details
    const gstDetails = [];
    if (Array.isArray(receiptDetails) && receiptDetails.length > 0) {
      const grouped = _.groupBy(receiptDetails, (item) => {
        const gstPerc = typeof item.gst === 'number' ? item.gst : parseFloat(item.gst);
        return gstPerc || 0;
      });

      Object.entries(grouped).forEach(([percentage, items]) => {
        const totalTax = _.sumBy(items, (item) => Number(item.gstAmount) || 0);
        const totalTaxable = _.sumBy(items, (item) => Number(item.taxableAmount) || 0);

        gstDetails.push({
          percentage: parseFloat(percentage),
          cgst: +(totalTax / 2).toFixed(2),
          sgst: +(totalTax / 2).toFixed(2),
          gst: +totalTax.toFixed(2),
          taxableAmount: +totalTaxable.toFixed(2)
        });
      });
    }
    const preDiscountTotal = transformedItems.reduce((acc, item) => acc + item.unitPrice, 0);
    const totalTax = gstDetails.reduce((acc, gst) => acc + gst.gst, 0);
    const totalQuantity = transformedItems.reduce((acc, item) => acc + item.quantity, 0);
    // Build payload
    return {
      receiptDetails: {
        receiptNo: receipt.receiptNo,
        date: moment(receipt.date).subtract(330, 'minutes').toISOString(),
        typeOfOrder: 'In-Store',
        invoiceType: 'Sales'
      },
      items: transformedItems,
      payment: {
        currency: 'INR',
        totalItem: transformedItems.length,
        preDiscountTotal,
        totalQuantity,
        totalTax: totalTax,
        totalAmount: receipt.totalAmount,
        adjustment: receipt.RoundOffAmount,
        discount: receipt.DiscountTotal,
        totalSavings: receipt.DiscountTotal,
        isGstIncluded: true,
        received: receipt.ReceivedAmount,
        balance: receipt.ChangeDue,
        ...(splitPayments.length > 0 ? {} : { mode: receipt.method }),
        splitPayments
      },
      gstDetails,
      customerInfo: {
        name: receipt.fullName,
        countryCode: '91',
        mobileNumber: receipt.mobileNumber || '9876543210',
        whatsappOptIn: true
      },
      loyaltyProgram: {
        pointsEarned: receipt.InvLP,
        totalPoints: receipt.CustLP
      },
      blzAPIKey: config.store.blzAPIKey || config.receiptApi.apiKey
    };
  }

  async sendToReceiptAPI(payload) {
    try {
      const response = await axios.post(`${config.receiptApi.baseUrl}/api/Receipts/v1/create`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'blz-api-key': payload.blzAPIKey || config.receiptApi.apiKey
        },
        timeout: config.receiptApi.timeout
      });

      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(`API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      } else if (error.request) {
        throw new Error('Network Error: No response from server');
      } else {
        throw new Error(`Request Error: ${error.message}`);
      }
    }
  }

  getStats() {
    return {
      ...this.syncStats,
      lastSyncTime: this.lastSyncTime,
      lastSyncedReceiptDate: this.lastSyncedReceiptDate,
      isSyncing: this.isSyncing,
      queueSize: Object.keys(this.syncQueue).length,
      failedCount: Object.keys(this.failedQueue).length
    };
  }

  async forceSyncNow() {
    logger.info('Manual sync triggered');
    await this.runSync();
  }
}

module.exports = SyncService;
