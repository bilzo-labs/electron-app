const { app, ipcMain } = require('electron');
const path = require('path');
const { config, validateConfig } = require('../shared/config');
const WindowManager = require('./window-manager');
const TrayManager = require('./tray');
const SyncService = require('./sync-service');
const sqlConnector = require('./sql-connector');

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('Another instance is already running');
  app.quit();
} else {
  let windowManager;
  let trayManager;
  let syncService;

  // Handle second instance
  app.on('second-instance', () => {
    if (windowManager) {
      windowManager.show();
    }
  });

  // App ready
  app.whenReady().then(async () => {
    console.log('Bilzo Receipt Sync - Starting...');

    // Validate configuration
    if (!validateConfig()) {
      console.error('Invalid configuration. Please check your .env file');
      app.quit();
      return;
    }

    try {
      // Initialize window manager
      windowManager = new WindowManager();
      windowManager.create();

      // Initialize tray
      trayManager = new TrayManager(windowManager);
      trayManager.create();

      // Initialize sync service
      syncService = new SyncService(trayManager);

      // Update tray menu with sync service reference
      trayManager.updateContextMenu(syncService);

      // Test SQL connection
      console.log('Testing SQL Server connection...');
      await sqlConnector.connect();
      console.log('SQL Server connection successful');

      // Start sync service
      syncService.start();

      // Set up auto-start if enabled
      if (config.app.autoStartOnBoot) {
        app.setLoginItemSettings({
          openAtLogin: true,
          path: app.getPath('exe')
        });
        console.log('Auto-start on boot enabled');
      }

      console.log('Application ready');
    } catch (error) {
      console.error('Startup error:', error);
      trayManager.updateStatus('error');
      trayManager.updateTooltip(`Startup error: ${error.message}`);
    }
  });

  // IPC Handlers
  ipcMain.handle('get-config', () => {
    return {
      apiUrl: config.validationApi.baseUrl,
      debug: config.app.debug
    };
  });

  ipcMain.handle('get-sync-stats', () => {
    if (syncService) {
      return syncService.getStats();
    }
    return null;
  });

  ipcMain.handle('trigger-sync', async () => {
    if (syncService) {
      await syncService.forceSyncNow();
      return { success: true };
    }
    return { success: false, error: 'Sync service not available' };
  });

  ipcMain.handle('check-sql-health', async () => {
    return {
      connected: sqlConnector.isHealthy(),
      timestamp: new Date().toISOString()
    };
  });

  ipcMain.handle('validate-coupon', async (event, couponCode, mobileNumber, purchaseAmount) => {
    try {
      const axios = require('axios');
      const response = await axios.post(
        `${config.validationApi.baseUrl}/api/Coupons/validate`,
        { couponCode, mobileNumber, purchaseAmount },
        {
          headers: {
            'Content-Type': 'application/json',
            'blz-api-key': config.validationApi.apiKey
          },
          timeout: config.validationApi.timeout
        }
      );
      return { success: true, data: response.data };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  });

  ipcMain.handle('sendOtp-coupon', async (event, couponCode, mobileNumber) => {
    try {
      const axios = require('axios');
      const response = await axios.post(
        `${config.validationApi.baseUrl}/api/Coupons/sendOtp`,
        { couponCode, mobileNumber },
        {
          headers: {
            'Content-Type': 'application/json',
            'blz-api-key': config.validationApi.apiKey
          },
          timeout: config.validationApi.timeout
        }
      );
      return { success: true, data: response.data };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  });

  ipcMain.handle('validateOtp-coupon', async (event, couponCode, mobileNumber, otp, referenceNumber) => {
    try {
      const axios = require('axios');
      const response = await axios.post(
        `${config.validationApi.baseUrl}/api/Coupons/validateOtp`,
        { couponCode, mobileNumber, otp, referenceNumber },
        {
          headers: {
            'Content-Type': 'application/json',
            'blz-api-key': config.validationApi.apiKey
          },
          timeout: config.validationApi.timeout
        }
      );
      return { success: true, data: response.data };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  });

  ipcMain.handle('redeem-coupon', async (event, couponCode, mobileNumber, purchaseAmount, receiptNo) => {
    try {
      const axios = require('axios');
      const response = await axios.post(
        `${config.validationApi.baseUrl}/api/Coupons/common-redeem`,
        {
          couponCode,
          mobileNumber,
          purchaseAmount,
          receiptNo
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'blz-api-key': config.validationApi.apiKey
          },
          timeout: config.validationApi.timeout
        }
      );
      return { success: true, data: response.data };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  });

  ipcMain.handle('validate-loyalty-points', async (event, mobile, totalAmount) => {
    try {
      const axios = require('axios');
      const response = await axios.post(
        `${config.validationApi.baseUrl}/api/Loyalty/common-validate`,
        { mobileNumber: mobile, totalAmount },
        {
          headers: {
            'blz-api-key': config.validationApi.apiKey
          },
          timeout: config.validationApi.timeout
        }
      );
      return { success: true, data: response.data };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  });

  ipcMain.handle('handle-loyalty-redemption', async (event, mobile, receiptNo, points) => {
    try {
      const axios = require('axios');
      const response = await axios.post(
        `${config.validationApi.baseUrl}/api/Loyalty/common-redeem`,
        { mobileNumber: mobile, receiptNo, points },
        {
          headers: {
            'blz-api-key': config.validationApi.apiKey
          },
          timeout: config.validationApi.timeout
        }
      );
      return { success: true, data: response.data };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  });

  ipcMain.handle('get-customer-profile', async (event, mobile) => {
    try {
      const axios = require('axios');
      const response = await axios.get(`${config.validationApi.baseUrl}/api/User/getUserProfile`, {
        params: { mobileNumber: mobile },
        headers: {
          'blz-api-key': config.validationApi.apiKey
        },
        timeout: config.validationApi.timeout
      });
      return { success: true, data: response.data };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  });

  // Quit when all windows are closed (except on macOS)
  app.on('window-all-closed', (event) => {
    event.preventDefault();
  });

  // Before quit
  app.on('before-quit', () => {
    if (windowManager) {
      windowManager.getWindow().isQuitting = true;
    }

    if (syncService) {
      syncService.stop();
    }

    if (sqlConnector) {
      sqlConnector.disconnect();
    }
  });

  // App quit
  app.on('will-quit', () => {
    if (trayManager) {
      trayManager.destroy();
    }
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
  });

  process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
  });
}
