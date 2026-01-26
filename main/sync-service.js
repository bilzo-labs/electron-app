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
    this.lastSyncedReceiptNo = this.store.get('lastSyncedReceiptNo', null);
    this.lastReceiptOnServer = this.store.get('lastReceiptOnServer', null);; // Will be fetched on demand
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

      // Get the most recent receipt number from server
      let lastReceiptOnServer = null;
      try {
        
        const data = await this.getLastReceiptOnServer();
        if (data) {
          lastReceiptOnServer = data;
          logger.info(`Found most recent receipt on server: ${lastReceiptOnServer}`);
          
          // Store in global storage and update instance variable
          this.store.set('lastReceiptOnServer', lastReceiptOnServer);
          this.lastReceiptOnServer = lastReceiptOnServer;
        } else {
          logger.debug('No receipt number found in API response');
        }
      } catch (error) {
        logger.warn('Failed to fetch recent receipt from server:', error.message);
      }

      // If no receipt found from API, try to get from storage
      if (!lastReceiptOnServer) {
        lastReceiptOnServer = this.store.get('lastReceiptOnServer');
        
        if (lastReceiptOnServer) {
          logger.info(`Using lastReceiptOnServer from storage: ${lastReceiptOnServer}`);
          // Update instance variable
          this.lastReceiptOnServer = lastReceiptOnServer;
        } else {
          logger.warn('No lastReceiptOnServer found in storage or from API. Skipping sync to prevent full database scan.');
          this.trayManager.updateStatus('idle');
          this.isSyncing = false;
          return;
        }
      }

      // Get recent receipts from SQL Server (only receipts after lastReceiptOnServer)
      const receipts = await sqlConnector.getRecentReceipts(lastReceiptOnServer);

      if (receipts.length === 0) {
        logger.info('No receipts found to sync');
        this.trayManager.updateStatus('idle');
        this.isSyncing = false;
        return;
      }

      logger.info(`Fetched ${receipts.length} receipts from SQL`);

      // Filter receipts based on validation rules
      const filteredReceipts = await this.filterReceipts(receipts);

      if (filteredReceipts.length === 0) {
        logger.info('No valid receipts found after filtering');
        this.trayManager.updateStatus('idle');
        this.isSyncing = false;
        return;
      }

      const groupedReceipts = _.groupBy(filteredReceipts, 'receiptNo');
      logger.info(`Found ${Object.keys(groupedReceipts).length} valid receipts to process`);
      
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
      this.store.set('lastSyncedReceiptNo', this.lastSyncedReceiptNo);
      // Update lastReceiptOnServer in store to match lastSyncedReceiptNo
      if (this.lastSyncedReceiptNo) {
        this.store.set('lastReceiptOnServer', this.lastSyncedReceiptNo);
        this.lastReceiptOnServer = this.lastSyncedReceiptNo;
      }

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

  async filterReceipts(receipts) {
    const validPrefixes = ['ANN/S/', 'AMB/S/', 'PMC/S/', 'TTK/S/', 'TNJ/S/'];
    const cutoffDate = new Date('2026-01-01T00:00:00.000Z');
    const filteredReceipts = [];
    
    logger.info(`Starting receipt filtering for ${receipts.length} receipts...`);

    for (const receipt of receipts) {
      const receiptNo = receipt.receiptNo;
      const receiptDate = new Date(receipt.date);

      // Check 1: Validate receipt number format
      const hasValidPrefix = validPrefixes.some(prefix => receiptNo.startsWith(prefix));
      
      if (!hasValidPrefix) {
        logger.warn(`Rejected receipt ${receiptNo}: Invalid prefix. Must start with one of: ${validPrefixes.join(', ')}`);
        continue;
      }

      // Check 2: Validate receipt date
      if (receiptDate < cutoffDate) {
        logger.warn(`Rejected receipt ${receiptNo}: Date ${receipt.date} is before cutoff date 01-01-2026`);
        continue;
      }

      // Check 3: Check if receipt already exists on server
      try {
        const existsOnServer = await this.checkReceiptExists(receiptNo);
        
        if (existsOnServer) {
          logger.info(`Skipping receipt ${receiptNo}: Already exists on server`);
          this.lastSyncedReceiptNo = receiptNo;
          this.lastReceiptOnServer = receiptNo;
          this.store.set('lastSyncedReceiptNo', receiptNo);
          this.store.set('lastReceiptOnServer', receiptNo);
          continue;
        }
      } catch (error) {
        logger.error(`Error checking if receipt ${receiptNo} exists on server:`, error);
        // Optionally, you can choose to skip this receipt or continue with processing
        // For safety, we'll skip it
        logger.warn(`Skipping receipt ${receiptNo} due to server check error`);
        continue;
      }

      // All checks passed
      filteredReceipts.push(receipt);
    }

    logger.info(`Filtering complete: ${filteredReceipts.length} out of ${receipts.length} receipts passed validation`);
    
    return filteredReceipts;
  }

  async checkReceiptExists(receiptNo) {
    try {
      const response = await axios.get(`${config.receiptApi.baseUrl}/api/Receipts/check`, {
        params: { receiptNo },
        headers: {
          'blz-api-key': config.receiptApi.apiKey
        },
        timeout: 10000 // 5 second timeout
      });

      return response.data.success;
    } catch (error) {
      // If it's a 404, the receipt doesn't exist
      if (error.response && error.response.status === 404) {
        return false;
      }
      throw error;
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

        // Update last synced receipt date and receipt number
        if (receipts[0].date) {
          const receiptDate = new Date(receipts[0].date);
          if (!this.lastSyncedReceiptDate || receiptDate > new Date(this.lastSyncedReceiptDate)) {
            this.lastSyncedReceiptDate = receiptDate.toISOString();
            this.lastSyncedReceiptNo = receiptNo;
            // Update lastReceiptOnServer to match lastSyncedReceiptNo
            this.lastReceiptOnServer = receiptNo;
          }
        }
        delete this.syncQueue[receiptNo];
        logger.info(`✓ Synced receipt: ${receiptNo} (${receipts[0].date})`);
      } catch (error) {
        // Handle case where receipt already exists on server
        if (error.isAlreadyExists) {
          logger.info(`⊘ Receipt ${receiptNo} already exists on server (recordId: ${error.recordId}), skipping...`);

          // Update last synced receipt date and receipt number even though it already exists
          if (receipts[0].date) {
            const receiptDate = new Date(receipts[0].date);
            if (!this.lastSyncedReceiptDate || receiptDate > new Date(this.lastSyncedReceiptDate)) {
              this.lastSyncedReceiptDate = receiptDate.toISOString();
              this.lastSyncedReceiptNo = receiptNo;
              // Update lastReceiptOnServer to match lastSyncedReceiptNo
              this.lastReceiptOnServer = receiptNo;
            }
          }

          // Remove from queue - don't process again
          delete this.syncQueue[receiptNo];
          // Don't count as success or failure - it's already synced
          continue;
        }

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
      const receipts = failed.receipts;
      try {
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

        // Update last synced receipt date and receipt number
        if (receipts[0].date) {
          const receiptDate = new Date(receipts[0].date);
          if (!this.lastSyncedReceiptDate || receiptDate > new Date(this.lastSyncedReceiptDate)) {
            this.lastSyncedReceiptDate = receiptDate.toISOString();
            this.lastSyncedReceiptNo = receiptNo;
            // Update lastReceiptOnServer to match lastSyncedReceiptNo
            this.lastReceiptOnServer = receiptNo;
          }
        }

        logger.info(`✓ Retry successful for ${receiptNo}`);
      } catch (error) {
        // Handle case where receipt already exists on server
        if (error.isAlreadyExists) {
          logger.info(
            `⊘ Receipt ${receiptNo} already exists on server (recordId: ${error.recordId}), removing from retry queue...`
          );

          // Update last synced receipt date and receipt number even though it already exists
          if (receipts[0].date) {
            const receiptDate = new Date(receipts[0].date);
            if (!this.lastSyncedReceiptDate || receiptDate > new Date(this.lastSyncedReceiptDate)) {
              this.lastSyncedReceiptDate = receiptDate.toISOString();
              this.lastSyncedReceiptNo = receiptNo;
              // Update lastReceiptOnServer to match lastSyncedReceiptNo
              this.lastReceiptOnServer = receiptNo;
            }
          }
          continue;
        }

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

    // Find loyalty redemption (POINTS payment mode)
    let loyaltyRedemptions = null;
    const pointsPayment = splitPayments.find((sp) => sp.method && sp.method.toUpperCase() === 'POINTS');
    if (pointsPayment) {
      loyaltyRedemptions = pointsPayment.amount;
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
        date: moment(receipt.date).toISOString(),
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
        loyaltyRedemptions: loyaltyRedemptions,
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

      // Check if receipt already exists on server
      if (response.data && response.data.message === 'Receipt Already Exist') {
        const error = new Error(`Receipt Already Exist: ${response.data.recordId}`);
        error.isAlreadyExists = true;
        error.recordId = response.data.recordId;
        throw error;
      }

      return response.data;
    } catch (error) {
      // Re-throw if it's our custom "already exists" error
      if (error.isAlreadyExists) {
        throw error;
      }

      if (error.response) {
        throw new Error(`API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      } else if (error.request) {
        throw new Error('Network Error: No response from server');
      } else {
        throw new Error(`Request Error: ${error.message}`);
      }
    }
  }

  async getLastReceiptOnServer() {
    try {
      const response = await axios.get(`${config.validationApi.baseUrl}/api/Receipts/recent`, {
        headers: {
          'blz-api-key': config.validationApi.apiKey || config.receiptApi.apiKey
        },
        timeout: config.validationApi.timeout || 10000
      });
      if (response.data && response.data.receiptDetails && response.data.receiptDetails.receiptNo) {
        return response.data.receiptDetails.receiptNo;
      }
      return null;
    } catch (error) {
      logger.warn('Failed to fetch last receipt on server:', error.message);
      return null;
    }
  }

  async getStats() {
    return {
      ...this.syncStats,
      lastSyncTime: this.lastSyncTime,
      lastSyncedReceiptDate: this.lastSyncedReceiptDate,
      lastSyncedReceiptNo: this.lastSyncedReceiptNo,
      lastReceiptOnServer: this.lastReceiptOnServer,
      isSyncing: this.isSyncing,
      queueSize: Object.keys(this.syncQueue).length,
      failedCount: Object.keys(this.failedQueue).length
    };
  }

  async forceSyncNow() {
    logger.info('Manual sync triggered');
    await this.runSync();
  }

  async forceManualSync(receiptNo) {
    try{
    logger.info(`Manual sync triggered for receipt: ${receiptNo}`);
    const { success, message } = await this.runSingleReceiptSync(receiptNo);
    return { success , message };
  } catch (error) {
      logger.error('Failed to trigger manual sync:', error);
      return { success: false, error: error.message };
    }
  }
  
  async runSingleReceiptSync(receiptNo) {
    if (this.isSyncing) {
      logger.info('Sync already in progress, skipping...');
      return { success: false, message: 'Sync already in progress, skipping...' };
    }

    this.isSyncing = true;
    this.trayManager.updateStatus('syncing');

    try {
      logger.info('Starting receipt sync...');
      let receipts;
      if(receiptNo){
       const receiptExistsAlready = await this.checkReceiptExists(receiptNo);
       if(receiptExistsAlready){
        logger.info(`Receipt ${receiptNo} already exists on server, skipping...`);
        this.trayManager.updateStatus('idle');
        this.isSyncing = false;
        return { success: false, message: 'Receipt already exists on server, skipping...' };
       }
       receipts = await sqlConnector.getSingleReceipt(receiptNo);
      }else{
        logger.info("No receiptNo found to sync");
      }
      if (receipts.length === 0) {
        logger.info('No receipts found to sync');
        this.trayManager.updateStatus('idle');
        this.isSyncing = false;
        return { success: false, message: 'No receipts found to sync' };
      }

      logger.info(`Fetched ${receipts.length} receipts from SQL`);

      // Filter receipts based on validation rules
      const filteredReceipts = await this.filterReceipts(receipts);

      if (filteredReceipts.length === 0) {
        logger.info('No valid receipts found after filtering');
        this.trayManager.updateStatus('idle');
        this.isSyncing = false;
        return { success: false, message: 'No valid receipts found after filtering' };
      }

      const groupedReceipts = _.groupBy(filteredReceipts, 'receiptNo');
      logger.info(`Found ${Object.keys(groupedReceipts).length} valid receipts to process`);
      
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
      this.store.set('lastSyncedReceiptNo', this.lastSyncedReceiptNo);
      // Update lastReceiptOnServer in store to match lastSyncedReceiptNo
      if (this.lastSyncedReceiptNo) {
        this.store.set('lastReceiptOnServer', this.lastSyncedReceiptNo);
        this.lastReceiptOnServer = this.lastSyncedReceiptNo;
      }

      logger.info(`Sync completed - Success: ${results.succeeded}, Failed: ${results.failed}`);

      this.trayManager.updateStatus('idle');
      this.trayManager.updateTooltip(
        `Last sync: ${moment(this.lastSyncTime).format('HH:mm:ss')}\n` + `Total synced: ${this.syncStats.totalSynced}`
      );
      return { success: true, message: `Sync completed successfully for receipt: ${receiptNo}` };
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
}

module.exports = SyncService;
