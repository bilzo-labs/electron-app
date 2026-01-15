const { app, ipcMain, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const {
  config,
  validateConfig,
  exportConfigToFile,
  reloadConfigFromFile,
  getConfigFilePath
} = require('../shared/config');
const getLogger = require('../shared/logger');
const WindowManager = require('./window-manager');
const TrayManager = require('./tray');
const SyncService = require('./sync-service');
const sqlConnector = require('./sql-connector');

// Initialize logger
const logger = getLogger();

// Configure auto-updater
autoUpdater.logger = logger;
autoUpdater.autoDownload = false; // Let user choose when to download
autoUpdater.autoInstallOnAppQuit = true; // Install update when app quits

// Update state
let updateState = {
  available: false,
  downloaded: false,
  version: null,
  releaseNotes: null,
  error: null
};

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  logger.info('Another instance is already running');
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
    logger.info('Bilzo Receipt Sync - Starting...');
    logger.info(`App version: ${app.getVersion() || '1.0.0'}`);
    logger.info(`Node version: ${process.version}`);
    logger.info(`Platform: ${process.platform}`);
    logger.info(`App is packaged: ${app.isPackaged}`);

    // Set application icon (for taskbar, window title bar, etc.)
    try {
      const iconPath = path.join(__dirname, '../assets/logo-home.ico');
      if (require('fs').existsSync(iconPath)) {
        const { nativeImage } = require('electron');
        const icon = nativeImage.createFromPath(iconPath);
        if (!icon.isEmpty()) {
          app.dock?.setIcon(iconPath); // macOS dock icon
          logger.info('Application icon set');
        }
      }
    } catch (error) {
      logger.warn('Could not set application icon:', error.message);
    }

    // In production, reload config from file first (in case user edited it)
    // Then only export if file doesn't exist or is incomplete
    if (app.isPackaged) {
      logger.info('Loading configuration from app data directory...');

      // First, reload config from file to update process.env
      const reloaded = reloadConfigFromFile();
      if (reloaded) {
        logger.info('Configuration reloaded from file');
      }

      // Only export if config file doesn't exist or is incomplete
      logger.info('Checking if configuration file needs to be created...');
      const exported = exportConfigToFile(false); // false = don't force, preserve existing
      if (exported) {
        const configPath = getConfigFilePath();
        logger.info(`Configuration file created at: ${configPath}`);
        // Reload again after creating file to ensure process.env is updated
        reloadConfigFromFile();
      } else {
        const configPath = getConfigFilePath();
        logger.info(`Using existing configuration file: ${configPath}`);
        // Log some config values to verify they're loaded (without sensitive data)
        logger.info(
          `Config loaded - POS Type: ${config.pos.type}, SQL Server: ${config.sqlServer.server}, Database: ${config.sqlServer.database}`
        );
      }
    }

    // Validate configuration
    if (!validateConfig()) {
      const configPath = app.isPackaged ? getConfigFilePath() : '.env';
      logger.error('Invalid configuration. Please check your configuration file');
      logger.error(`Config file location: ${configPath}`);

      // Show error dialog
      dialog.showErrorBox(
        'Configuration Error',
        `Invalid configuration detected.\n\n` +
          `Please check your configuration file:\n${configPath}\n\n` +
          `Required variables:\n` +
          `- SQL_USER\n` +
          `- SQL_PASSWORD\n` +
          `- SQL_SERVER\n` +
          `- SQL_DATABASE\n` +
          `- RECEIPT_API_KEY\n\n` +
          `Logs are available at: ${logger.getLogDir()}`
      );

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
      logger.info('Testing SQL Server connection...');
      await sqlConnector.connect();
      logger.info('SQL Server connection successful');

      // Start sync service
      syncService.start();

      // Set up auto-start if enabled
      if (config.app.autoStartOnBoot) {
        app.setLoginItemSettings({
          openAtLogin: true,
          path: app.getPath('exe')
        });
        logger.info('Auto-start on boot enabled');
      }

      // Check for updates (only in production)
      if (app.isPackaged) {
        logger.info('Checking for updates...');
        autoUpdater.checkForUpdates().catch((error) => {
          logger.error('Failed to check for updates:', error);
        });
      } else {
        logger.info('Skipping update check in development mode');
      }

      logger.info('Application ready');
    } catch (error) {
      logger.error('Startup error:', error);

      // Show error dialog
      dialog.showErrorBox(
        'Startup Error',
        `Failed to start application:\n\n${error.message}\n\n` + `Check logs at: ${logger.getLogDir()}`
      );

      if (trayManager) {
        trayManager.updateStatus('error');
        trayManager.updateTooltip(`Startup error: ${error.message}`);
      }
    }
  });

  // Auto-updater event handlers
  autoUpdater.on('checking-for-update', () => {
    logger.info('Checking for updates...');
    updateState.error = null;
    if (windowManager) {
      windowManager.getWindow()?.webContents.send('update-status', {
        status: 'checking',
        message: 'Checking for updates...'
      });
    }
  });

  autoUpdater.on('update-available', (info) => {
    logger.info('Update available:', info.version);
    updateState.available = true;
    updateState.version = info.version;
    updateState.releaseNotes = info.releaseNotes;

    if (windowManager) {
      windowManager.getWindow()?.webContents.send('update-status', {
        status: 'available',
        version: info.version,
        releaseNotes: info.releaseNotes,
        message: `Update ${info.version} is available`
      });
    }

    // Show notification dialog
    dialog
      .showMessageBox(windowManager?.getWindow() || null, {
        type: 'info',
        title: 'Update Available',
        message: `A new version (${info.version}) is available.`,
        detail: 'Would you like to download and install it now?',
        buttons: ['Download Now', 'Later'],
        defaultId: 0,
        cancelId: 1
      })
      .then((result) => {
        if (result.response === 0) {
          logger.info('User chose to download update');
          autoUpdater.downloadUpdate();
        } else {
          logger.info('User chose to download update later');
        }
      });
  });

  autoUpdater.on('update-not-available', (info) => {
    logger.info('Update not available. Current version is latest.');
    updateState.available = false;
    if (windowManager) {
      windowManager.getWindow()?.webContents.send('update-status', {
        status: 'not-available',
        message: 'You are using the latest version'
      });
    }
  });

  autoUpdater.on('error', (error) => {
    logger.error('Update error:', error);
    updateState.error = error.message;
    if (windowManager) {
      windowManager.getWindow()?.webContents.send('update-status', {
        status: 'error',
        error: error.message,
        message: `Update error: ${error.message}`
      });
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    const message = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`;
    logger.info(message);
    if (windowManager) {
      windowManager.getWindow()?.webContents.send('update-status', {
        status: 'downloading',
        progress: progressObj.percent,
        message: `Downloading update... ${Math.round(progressObj.percent)}%`
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    logger.info('Update downloaded:', info.version);
    updateState.downloaded = true;
    updateState.version = info.version;

    if (windowManager) {
      windowManager.getWindow()?.webContents.send('update-status', {
        status: 'downloaded',
        version: info.version,
        message: 'Update downloaded. It will be installed when you restart the app.'
      });
    }

    // Show notification dialog
    dialog
      .showMessageBox(windowManager?.getWindow() || null, {
        type: 'info',
        title: 'Update Downloaded',
        message: `Update ${info.version} has been downloaded.`,
        detail: 'The update will be installed when you restart the application. Would you like to restart now?',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
        cancelId: 1
      })
      .then((result) => {
        if (result.response === 0) {
          logger.info('User chose to restart and install update');
          autoUpdater.quitAndInstall(false, true);
        } else {
          logger.info('User chose to restart later');
        }
      });
  });

  // IPC Handlers
  ipcMain.handle('get-config', () => {
    return {
      apiUrl: config.validationApi.baseUrl,
      debug: config.app.debug
    };
  });

  ipcMain.handle('get-log-path', () => {
    return {
      logDir: logger.getLogDir(),
      logFile: logger.getLogPath()
    };
  });

  ipcMain.handle('get-recent-logs', (event, lines = 100) => {
    return logger.getRecentLogs(lines);
  });

  ipcMain.handle('get-sync-stats', async () => {
    if (syncService) {
      return await syncService.getStats();
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

  // Update-related IPC handlers
  ipcMain.handle('check-for-updates', async () => {
    if (!app.isPackaged) {
      return { success: false, error: 'Update check is only available in production builds' };
    }
    try {
      await autoUpdater.checkForUpdates();
      return { success: true, message: 'Checking for updates...' };
    } catch (error) {
      logger.error('Failed to check for updates:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('download-update', async () => {
    if (updateState.available && !updateState.downloaded) {
      try {
        await autoUpdater.downloadUpdate();
        return { success: true, message: 'Download started...' };
      } catch (error) {
        logger.error('Failed to download update:', error);
        return { success: false, error: error.message };
      }
    }
    return { success: false, error: 'No update available to download' };
  });

  ipcMain.handle('install-update', async () => {
    if (updateState.downloaded) {
      autoUpdater.quitAndInstall(false, true);
      return { success: true, message: 'Restarting to install update...' };
    }
    return { success: false, error: 'No update downloaded' };
  });

  ipcMain.handle('get-update-status', () => {
    return {
      available: updateState.available,
      downloaded: updateState.downloaded,
      version: updateState.version,
      releaseNotes: updateState.releaseNotes,
      error: updateState.error,
      currentVersion: app.getVersion()
    };
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
    logger.error('Uncaught Exception:', error);

    // Show error dialog for critical errors
    if (app.isReady()) {
      dialog.showErrorBox(
        'Application Error',
        `An unexpected error occurred:\n\n${error.message}\n\n` + `Check logs at: ${logger.getLogDir()}`
      );
    }
  });

  process.on('unhandledRejection', (error) => {
    logger.error('Unhandled Rejection:', error);
  });
}
