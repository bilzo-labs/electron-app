const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Configuration
  getConfig: () => ipcRenderer.invoke('get-config'),

  // Sync operations
  getSyncStats: () => ipcRenderer.invoke('get-sync-stats'),
  triggerSync: () => ipcRenderer.invoke('trigger-sync'),
  triggerManualReceiptSync: (receiptNo) => ipcRenderer.invoke('trigger-manual-receipt-sync', receiptNo),

  // Validation operations
  validateCoupon: (couponCode, mobile, purchaseAmount) =>
    ipcRenderer.invoke('validate-coupon', couponCode, mobile, purchaseAmount),

  sendOtpCoupon: (couponCode, mobile) => ipcRenderer.invoke('sendOtp-coupon', couponCode, mobile),

  validateOtpCoupon: (couponCode, mobile, otp, referenceNumber) =>
    ipcRenderer.invoke('validateOtp-coupon', couponCode, mobile, otp, referenceNumber),

  redeemCoupon: (couponCode, mobile, purchaseAmount, receiptNo) =>
    ipcRenderer.invoke('redeem-coupon', couponCode, mobile, purchaseAmount, receiptNo),

  getLoyaltyPoints: (mobile) => ipcRenderer.invoke('validate-loyalty-points', mobile),

  loyaltyRedemptions: (mobile, receiptNo, points) =>
    ipcRenderer.invoke('handle-loyalty-redemption', mobile, receiptNo, points),

  getCustomerProfile: (mobile) => ipcRenderer.invoke('get-customer-profile', mobile),

  // Event listeners
  onSyncStats: (callback) => {
    ipcRenderer.on('sync-stats', (event, data) => callback(data));
  },
  onUpdateStatus: (callback) => {
    ipcRenderer.on('update-status', (event, data) => callback(data));
  },

  // Update operations
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),

  // Auto-start operations
  getAutoStartStatus: () => ipcRenderer.invoke('get-auto-start-status'),
  setAutoStart: (enabled) => ipcRenderer.invoke('set-auto-start', enabled)
});
