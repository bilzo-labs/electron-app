const fs = require('fs');
const path = require('path');

// Load environment variables
// In development: from .env file
// In production: from config file in app data directory
function loadEnvironmentVariables() {
  let app;
  try {
    app = require('electron').app;
  } catch (error) {
    // Electron app not available yet, will try later
  }

  const isDev = process.env.NODE_ENV !== 'production' || !app || (app && app.isPackaged === false);

  if (isDev) {
    // Development: Load from .env file
    try {
      require('dotenv').config();
    } catch (error) {
      // dotenv might not be available, continue without it
    }
  } else {
    // Production: Load from config file in app data directory
    try {
      if (!app || typeof app.getPath !== 'function') {
        // Fallback path when app is not available
        const appName = 'receipt-sync-electron-app';
        let userDataPath;
        if (process.platform === 'win32') {
          userDataPath = path.join(process.env.APPDATA || process.env.LOCALAPPDATA || process.env.USERPROFILE, appName);
        } else if (process.platform === 'darwin') {
          userDataPath = path.join(process.env.HOME || '~', 'Library', 'Application Support', appName);
        } else {
          userDataPath = path.join(process.env.HOME || '~', '.config', appName);
        }
        const configFile = path.join(userDataPath, 'config.env');
        loadConfigFile(configFile);
      } else {
        const userDataPath = app.getPath('userData');
        const configFile = path.join(userDataPath, 'config.env');
        loadConfigFile(configFile);
      }
    } catch (error) {
      // Silently fail - will try again later or use defaults
    }
  }
}

function loadConfigFile(configFile) {
  if (fs.existsSync(configFile)) {
    const configContent = fs.readFileSync(configFile, 'utf8');
    const lines = configContent.split('\n');

    lines.forEach((line) => {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const [key, ...valueParts] = trimmedLine.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').trim();
          // Remove quotes if present
          const cleanValue = value.replace(/^["']|["']$/g, '');
          process.env[key.trim()] = cleanValue;
        }
      }
    });
  }
}

// Load environment variables
loadEnvironmentVariables();

// Create config object with getters that read from process.env dynamically
// This ensures config always reflects current process.env values
const config = {
  // POS System Configuration
  get pos() {
    return {
      type: process.env.POS_TYPE || 'HDPOS' // HDPOS, QUICKBILL, or GENERIC
    };
  },

  // SQL Server Configuration
  get sqlServer() {
    return {
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      server: process.env.SQL_SERVER || 'localhost',
      database: process.env.SQL_DATABASE,
      port: parseInt(process.env.SQL_PORT) || 50283,
      options: {
        trustedConnection: process.env.SQL_TRUSTED_CONNECTION === 'true',
        enableArithAbort: true,
        instanceName: process.env.SQL_INSTANCE_NAME || 'SQLEXPRESS',
        trustServerCertificate: true,
        encrypt: false
      }
    };
  },

  // Receipt API Configuration
  get receiptApi() {
    return {
      baseUrl: process.env.RECEIPT_API_URL || 'https://sls.bilzo.in',
      apiKey: process.env.RECEIPT_API_KEY,
      timeout: 30000,
      lastSyncedEndpoint: process.env.LAST_SYNCED_RECEIPT_ENDPOINT || ''
    };
  },

  // Validation API Configuration
  get validationApi() {
    return {
      baseUrl: process.env.VALIDATION_API_URL || 'https://sls.bilzo.in',
      apiKey: process.env.VALIDATION_API_KEY,
      timeout: 10000
    };
  },

  // Sync Configuration
  get sync() {
    return {
      intervalMinutes: parseInt(process.env.SYNC_INTERVAL_MINUTES) || 5,
      enabled: process.env.SYNC_ENABLED !== 'false',
      batchSize: 50, // Maximum receipts to sync per batch
      retryAttempts: 3,
      retryDelay: 5000 // ms
    };
  },

  // Application Configuration
  get app() {
    return {
      nodeEnv: process.env.NODE_ENV || 'development',
      debug: process.env.DEBUG === 'true',
      autoStartOnBoot: process.env.AUTO_START_ON_BOOT === 'true'
    };
  },

  // Store Configuration
  get store() {
    return {
      storeId: process.env.STORE_ID,
      organizationId: process.env.ORGANIZATION_ID,
      cashRegisterId: process.env.CASH_REGISTER_ID
    };
  },

  // Window Configuration (static, doesn't need getter)
  window: {
    width: 420,
    height: 650,
    minWidth: 380,
    minHeight: 500
  }
};

// Reload config from file (useful after user edits it)
function reloadConfigFromFile() {
  try {
    let app;
    try {
      app = require('electron').app;
    } catch (error) {
      return false;
    }

    if (!app || typeof app.getPath !== 'function') {
      return false;
    }

    const userDataPath = app.getPath('userData');
    const configFile = path.join(userDataPath, 'config.env');

    if (fs.existsSync(configFile)) {
      loadConfigFile(configFile);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Failed to reload config from file:', error);
    return false;
  }
}

// Export config to file in app data directory
// Only exports if file doesn't exist or is missing required values
function exportConfigToFile(force = false) {
  try {
    let app;
    try {
      app = require('electron').app;
    } catch (error) {
      return false;
    }

    if (!app || typeof app.getPath !== 'function') {
      return false;
    }

    const userDataPath = app.getPath('userData');
    const configFile = path.join(userDataPath, 'config.env');

    // Check if config file exists and has content
    let existingConfig = {};
    if (fs.existsSync(configFile) && !force) {
      // Read existing config file
      try {
        const configContent = fs.readFileSync(configFile, 'utf8');
        const lines = configContent.split('\n');

        lines.forEach((line) => {
          const trimmedLine = line.trim();
          if (trimmedLine && !trimmedLine.startsWith('#')) {
            const [key, ...valueParts] = trimmedLine.split('=');
            if (key && valueParts.length > 0) {
              const value = valueParts.join('=').trim();
              const cleanValue = value.replace(/^["']|["']$/g, '');
              existingConfig[key.trim()] = cleanValue;
            }
          }
        });

        // Check if required values exist
        const requiredVars = ['SQL_USER', 'SQL_PASSWORD', 'SQL_SERVER', 'SQL_DATABASE', 'RECEIPT_API_KEY'];
        const hasRequiredVars = requiredVars.every((key) => existingConfig[key] && existingConfig[key].trim() !== '');

        // If file exists and has required values, don't overwrite it
        if (hasRequiredVars) {
          return false; // File exists and is valid, don't overwrite
        }
      } catch (error) {
        // If we can't read the file, we'll create a new one
        console.warn('Could not read existing config file, will create new one:', error);
      }
    }

    // Get all environment variables that start with known prefixes
    const envVars = [
      'POS_TYPE',
      'SQL_USER',
      'SQL_PASSWORD',
      'SQL_SERVER',
      'SQL_DATABASE',
      'SQL_PORT',
      'SQL_TRUSTED_CONNECTION',
      'SQL_INSTANCE_NAME',
      'RECEIPT_API_URL',
      'RECEIPT_API_KEY',
      'LAST_SYNCED_RECEIPT_ENDPOINT',
      'VALIDATION_API_URL',
      'VALIDATION_API_KEY',
      'SYNC_INTERVAL_MINUTES',
      'SYNC_ENABLED',
      'NODE_ENV',
      'DEBUG',
      'AUTO_START_ON_BOOT',
      'STORE_ID',
      'ORGANIZATION_ID',
      'CASH_REGISTER_ID'
    ];

    let configContent = '# Bilzo Receipt Sync Configuration\n';
    configContent += '# This file is automatically generated\n';
    configContent += '# Edit this file to change configuration\n';
    configContent += '# WARNING: Do not delete this file - edit values as needed\n\n';

    envVars.forEach((key) => {
      // Prefer existing config value, then process.env, then skip if neither exists
      const value = existingConfig[key] || process.env[key];
      if (value !== undefined && value !== null && value !== '') {
        // Escape values that contain spaces or special characters
        const escapedValue = value.includes(' ') || value.includes('=') ? `"${value}"` : value;
        configContent += `${key}=${escapedValue}\n`;
      }
    });

    // Ensure directory exists
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }

    fs.writeFileSync(configFile, configContent, 'utf8');
    return true;
  } catch (error) {
    console.error('Failed to export config to file:', error);
    return false;
  }
}

// Get config file path
function getConfigFilePath() {
  try {
    let app;
    try {
      app = require('electron').app;
    } catch (error) {
      return null;
    }

    if (!app || typeof app.getPath !== 'function') {
      // Fallback path
      const appName = 'receipt-sync-electron-app';
      let userDataPath;
      if (process.platform === 'win32') {
        userDataPath = path.join(process.env.APPDATA || process.env.LOCALAPPDATA || process.env.USERPROFILE, appName);
      } else if (process.platform === 'darwin') {
        userDataPath = path.join(process.env.HOME || '~', 'Library', 'Application Support', appName);
      } else {
        userDataPath = path.join(process.env.HOME || '~', '.config', appName);
      }
      return path.join(userDataPath, 'config.env');
    }

    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'config.env');
  } catch (error) {
    return null;
  }
}

// Validation
const validateConfig = () => {
  const errors = [];

  if (!config.sqlServer.user) errors.push('SQL_USER is required');
  if (!config.sqlServer.password) errors.push('SQL_PASSWORD is required');
  if (!config.sqlServer.server) errors.push('SQL_SERVER is required');
  if (!config.sqlServer.database) errors.push('SQL_DATABASE is required');
  if (!config.receiptApi.apiKey) errors.push('RECEIPT_API_KEY is required');

  if (errors.length > 0) {
    console.error('Configuration errors:');
    errors.forEach((err) => console.error(`  - ${err}`));
    return false;
  }

  return true;
};

module.exports = {
  config,
  validateConfig,
  exportConfigToFile,
  reloadConfigFromFile,
  getConfigFilePath
};
