const schedule = require('node-schedule');
const axios = require('axios');
const moment = require('moment-timezone');
const { config } = require('../shared/config');
const sqlConnector = require('./sql-connector');
const Store = require('electron-store');

class SyncService {
  constructor(trayManager) {
    this.trayManager = trayManager;
    this.store = new Store();
    this.job = null;
    this.isSyncing = false;
    this.lastSyncTime = this.store.get('lastSyncTime', null);
    this.failedReceipts = this.store.get('failedReceipts', []);
    this.syncStats = {
      totalSynced: this.store.get('totalSynced', 0),
      totalFailed: this.store.get('totalFailed', 0),
      lastError: null
    };
  }

  start() {
    if (!config.sync.enabled) {
      console.log('Sync service is disabled');
      return;
    }

    console.log(`Starting sync service - interval: ${config.sync.intervalMinutes} minutes`);

    // Run initial sync after 10 seconds
    setTimeout(() => {
      this.runSync();
    }, 10000);

    // Schedule periodic sync
    const intervalMs = config.sync.intervalMinutes * 60 * 1000;
    this.job = schedule.scheduleJob(`*/${config.sync.intervalMinutes} * * * *`, () => {
      this.runSync();
    });

    console.log('Sync service started');
  }

  stop() {
    if (this.job) {
      this.job.cancel();
      this.job = null;
      console.log('Sync service stopped');
    }
  }

  async runSync() {
    if (this.isSyncing) {
      console.log('Sync already in progress, skipping...');
      return;
    }

    this.isSyncing = true;
    this.trayManager.updateStatus('syncing');

    try {
      console.log('Starting receipt sync...');

      // Retry failed receipts first
      if (this.failedReceipts.length > 0) {
        await this.retryFailedReceipts();
      }

      // Get recent receipts from SQL Server
      const receipts = await sqlConnector.getRecentReceipts(config.sync.batchSize);
      console.log(`Found ${receipts.length} receipts to process`);

      if (receipts.length === 0) {
        this.trayManager.updateStatus('idle');
        this.isSyncing = false;
        return;
      }

      // Process receipts in batches
      const results = await this.processReceipts(receipts);

      // Update statistics
      this.syncStats.totalSynced += results.succeeded;
      this.syncStats.totalFailed += results.failed;
      this.lastSyncTime = new Date().toISOString();

      // Persist stats
      this.store.set('totalSynced', this.syncStats.totalSynced);
      this.store.set('totalFailed', this.syncStats.totalFailed);
      this.store.set('lastSyncTime', this.lastSyncTime);
      this.store.set('failedReceipts', this.failedReceipts);

      console.log(`Sync completed - Success: ${results.succeeded}, Failed: ${results.failed}`);

      this.trayManager.updateStatus('idle');
      this.trayManager.updateTooltip(
        `Last sync: ${moment(this.lastSyncTime).format('HH:mm:ss')}\n` +
        `Total synced: ${this.syncStats.totalSynced}`
      );

    } catch (error) {
      console.error('Sync error:', error);
      this.syncStats.lastError = error.message;
      this.trayManager.updateStatus('error');
      this.trayManager.updateTooltip(`Sync error: ${error.message}`);
    } finally {
      this.isSyncing = false;
    }
  }

  async processReceipts(receipts) {
    const results = { succeeded: 0, failed: 0 };

    for (const receipt of receipts) {
      try {
        // Check if already synced
        const syncedReceipts = this.store.get('syncedReceipts', []);
        if (syncedReceipts.includes(receipt.InvoiceId)) {
          console.log(`Receipt ${receipt.BillNumber} already synced, skipping...`);
          continue;
        }

        // Get full receipt details
        const receiptDetails = await sqlConnector.getReceiptDetails(receipt.InvoiceId);

        if (!receiptDetails) {
          console.warn(`No details found for receipt ${receipt.InvoiceId}`);
          continue;
        }

        // Transform to API format
        const apiPayload = this.transformReceiptData(receiptDetails);

        // Send to remote API
        await this.sendToReceiptAPI(apiPayload);

        // Mark as synced
        syncedReceipts.push(receipt.InvoiceId);
        this.store.set('syncedReceipts', syncedReceipts);

        results.succeeded++;
        console.log(`✓ Synced receipt: ${receipt.BillNumber}`);

      } catch (error) {
        console.error(`✗ Failed to sync receipt ${receipt.BillNumber}:`, error.message);

        // Add to failed queue
        this.failedReceipts.push({
          invoiceId: receipt.InvoiceId,
          billNumber: receipt.BillNumber,
          error: error.message,
          attempts: 1,
          lastAttempt: new Date().toISOString()
        });

        results.failed++;
      }
    }

    return results;
  }

  async retryFailedReceipts() {
    console.log(`Retrying ${this.failedReceipts.length} failed receipts...`);

    const stillFailed = [];

    for (const failed of this.failedReceipts) {
      if (failed.attempts >= config.sync.retryAttempts) {
        console.log(`Max retries reached for ${failed.billNumber}, skipping...`);
        stillFailed.push(failed);
        continue;
      }

      try {
        const receiptDetails = await sqlConnector.getReceiptDetails(failed.invoiceId);
        const apiPayload = this.transformReceiptData(receiptDetails);
        await this.sendToReceiptAPI(apiPayload);

        // Success - remove from failed queue
        const syncedReceipts = this.store.get('syncedReceipts', []);
        syncedReceipts.push(failed.invoiceId);
        this.store.set('syncedReceipts', syncedReceipts);

        console.log(`✓ Retry successful for ${failed.billNumber}`);

      } catch (error) {
        // Still failing - increment attempts
        failed.attempts++;
        failed.lastAttempt = new Date().toISOString();
        failed.error = error.message;
        stillFailed.push(failed);

        console.log(`✗ Retry failed for ${failed.billNumber} (attempt ${failed.attempts})`);
      }
    }

    this.failedReceipts = stillFailed;
  }

  transformReceiptData(receiptDetails) {
    const { main, items } = receiptDetails;

    // Transform items
    const transformedItems = items.map(item => ({
      serialNo: item.SerialNumber,
      name: item.ItemName,
      quantity: item.Quantity,
      unitPrice: item.MRP,
      discountedPrice: item.FinalPrice,
      discount: item.DiscountedAmount,
      netAmount: item.ItemTotalAmount,
      gst: item.TaxPercentage,
      hsnCode: item.HSN,
      itemCode: item.Barcode
    }));

    // Parse payment details
    const splitPayments = [];
    if (main.PaymentDetailString) {
      const payments = main.PaymentDetailString.split('|');
      payments.forEach(str => {
        const [method, amount] = str.split('~');
        if (method && amount) {
          splitPayments.push({ method, amount: parseFloat(amount) });
        }
      });
    }

    // Parse GST details
    const gstDetails = [];
    if (main.TaxDetailString) {
      const gstSplit = main.TaxDetailString.split('~').filter(Boolean);
      const gstMap = {};

      gstSplit.forEach(obj => {
        const cgstMatch = obj.match(/CGST ([0-9.]+) % \| ([0-9.]+)/);
        const sgstMatch = obj.match(/SGST ([0-9.]+) % \| ([0-9.]+)/);

        if (cgstMatch) {
          const percentage = parseFloat(cgstMatch[1]);
          const amount = parseFloat(cgstMatch[2]);
          if (!gstMap[percentage]) gstMap[percentage] = { percentage: 0, cgst: 0, sgst: 0 };
          gstMap[percentage].percentage += percentage;
          gstMap[percentage].cgst = amount;
        }

        if (sgstMatch) {
          const percentage = parseFloat(sgstMatch[1]);
          const amount = parseFloat(sgstMatch[2]);
          if (!gstMap[percentage]) gstMap[percentage] = { percentage: 0, cgst: 0, sgst: 0 };
          gstMap[percentage].percentage += percentage;
          gstMap[percentage].sgst = amount;
        }
      });

      Object.values(gstMap).forEach(gst => {
        const totalGst = gst.cgst + gst.sgst;
        const taxableAmount = (totalGst * 100) / gst.percentage;
        gstDetails.push({
          percentage: gst.percentage,
          cgst: gst.cgst,
          sgst: gst.sgst,
          gst: totalGst,
          taxableAmount: parseFloat(taxableAmount.toFixed(2))
        });
      });
    }

    // Build payload
    return {
      receiptDetails: {
        receiptNo: main.BillNumber,
        date: moment(main.InvoiceDate).subtract(330, 'minutes').toISOString(),
        counter: main.CRNumber,
        counterPerson: main.Creator,
        posId: main.CRNumber,
        typeOfOrder: 'In-Store',
        invoiceType: 'Sales'
      },
      items: transformedItems,
      payment: {
        currency: 'INR',
        totalItem: main.NumberOfItems,
        totalQuantity: main.TotalItemQty,
        totalTax: main.TaxGrandTotal,
        totalAmount: main.GrandTotal,
        adjustment: main.RoundOffAmount,
        discount: main.DiscountTotal,
        totalSavings: main.DiscountTotal,
        savingsPercentage: main.DiscountTotalPer,
        isGstIncluded: true,
        redemptions: main.StoreCreditUsed,
        received: main.ReceivedAmount,
        balance: main.ChangeDue,
        splitPayments
      },
      gstDetails,
      customerInfo: {
        name: main.CustName,
        firstName: main.FirstName,
        lastName: main.LastName,
        countryCode: '91',
        mobileNumber: main.CustMobile,
        whatsappOptIn: true
      },
      loyaltyProgram: {
        pointsEarned: main.InvLP,
        totalPoints: main.CustLP
      },
      blzAPIKey: main.blzAPIKey || config.receiptApi.apiKey
    };
  }

  async sendToReceiptAPI(payload) {
    try {
      const response = await axios.post(
        `${config.receiptApi.baseUrl}/api/v1/receipts`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': payload.blzAPIKey || config.receiptApi.apiKey
          },
          timeout: config.receiptApi.timeout
        }
      );

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
      isSyncing: this.isSyncing,
      failedCount: this.failedReceipts.length
    };
  }

  async forceSyncNow() {
    console.log('Manual sync triggered');
    await this.runSync();
  }
}

module.exports = SyncService;
