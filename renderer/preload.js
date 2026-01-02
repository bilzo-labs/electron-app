const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Configuration
  getConfig: () => ipcRenderer.invoke('get-config'),

  // Sync operations
  getSyncStats: () => ipcRenderer.invoke('get-sync-stats'),
  triggerSync: () => ipcRenderer.invoke('trigger-sync'),
  checkSqlHealth: () => ipcRenderer.invoke('check-sql-health'),

  // Validation operations
  validateCoupon: (couponCode, mobile) => ipcRenderer.invoke('validate-coupon', couponCode, mobile),

  getLoyaltyPoints: (mobile) => ipcRenderer.invoke('validate-loyalty-points', mobile),

  loyaltyRedemptions: (mobile, receiptNo, points) =>
    ipcRenderer.invoke('handle-loyalty-redemption', mobile, receiptNo, points),

  getCustomerProfile: (mobile) => ipcRenderer.invoke('get-customer-profile', mobile),

  // Event listeners
  onSyncStats: (callback) => {
    ipcRenderer.on('sync-stats', (event, data) => callback(data));
  }
});
