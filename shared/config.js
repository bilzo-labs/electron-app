require('dotenv').config();

const config = {
  // POS System Configuration
  pos: {
    type: process.env.POS_TYPE || 'HDPOS' // HDPOS, QUICKBILL, or GENERIC
  },

  // SQL Server Configuration
  sqlServer: {
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
  },

  // Receipt API Configuration
  receiptApi: {
    baseUrl: process.env.RECEIPT_API_URL || 'https://sls.bilzo.in',
    apiKey: process.env.RECEIPT_API_KEY,
    timeout: 30000,
    lastSyncedEndpoint: process.env.LAST_SYNCED_RECEIPT_ENDPOINT || ''
  },

  // Validation API Configuration
  validationApi: {
    baseUrl: process.env.VALIDATION_API_URL || 'https://sls.bilzo.in',
    apiKey: process.env.VALIDATION_API_KEY,
    timeout: 10000
  },

  // Sync Configuration
  sync: {
    intervalMinutes: parseInt(process.env.SYNC_INTERVAL_MINUTES) || 5,
    enabled: process.env.SYNC_ENABLED !== 'false',
    batchSize: 50, // Maximum receipts to sync per batch
    retryAttempts: 3,
    retryDelay: 5000 // ms
  },

  // Application Configuration
  app: {
    nodeEnv: process.env.NODE_ENV || 'development',
    debug: process.env.DEBUG === 'true',
    autoStartOnBoot: process.env.AUTO_START_ON_BOOT === 'true'
  },

  // Store Configuration
  store: {
    storeId: process.env.STORE_ID,
    organizationId: process.env.ORGANIZATION_ID,
    cashRegisterId: process.env.CASH_REGISTER_ID
  },

  // Window Configuration
  window: {
    width: 420,
    height: 650,
    minWidth: 380,
    minHeight: 500
  }
};

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
    errors.forEach(err => console.error(`  - ${err}`));
    return false;
  }

  return true;
};

module.exports = {
  config,
  validateConfig
};
