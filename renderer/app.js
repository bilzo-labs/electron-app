// App state
let currentTab = 'customer';
let storedReferenceNumber = null; // Store referenceNumber from sendOtp-coupon response

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
  console.log('App initializing...');

  // Set up tab navigation
  setupTabNavigation();

  // Set up event listeners
  setupEventListeners();

  // Check initial status
  await updateSyncStatus();

  // Load config
  const config = await window.electronAPI.getConfig();
  console.log('Config loaded:', config);
});

// Tab Navigation
function setupTabNavigation() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.tab;

      // Update active states
      tabButtons.forEach((btn) => btn.classList.remove('active'));
      tabContents.forEach((content) => content.classList.remove('active'));

      button.classList.add('active');
      document.getElementById(`${tabName}-tab`).classList.add('active');

      currentTab = tabName;

      // Load tab-specific data
      if (tabName === 'sync') {
        updateSyncStatus();
      }
    });
  });
}

// Event Listeners
function setupEventListeners() {
  // Customer lookup
  document.getElementById('searchCustomer').addEventListener('click', handleCustomerSearch);
  document.getElementById('customerMobile').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleCustomerSearch();
  });

  // Coupon validation
  document.getElementById('validateCoupon').addEventListener('click', handleCouponValidation);
  document.getElementById('sendOtpCoupon').addEventListener('click', handleSendOtpCoupon);
  document.getElementById('validateCouponOtp').addEventListener('click', handleValidateCouponOtp);
  document.getElementById('redeemCouponBtn').addEventListener('click', handleRedeemCoupon);
  document.getElementById('couponCode').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleCouponValidation();
  });

  // Loyalty points
  document.getElementById('checkLoyalty').addEventListener('click', handleLoyaltyCheck);
  document.getElementById('loyaltyRedemption').addEventListener('click', handleLoyaltyRedemption);
  document.getElementById('loyaltyMobile').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLoyaltyCheck();
  });

  // Sync controls
  document.getElementById('refreshSync').addEventListener('click', updateSyncStatus);
  document.getElementById('forceSyncNow').addEventListener('click', handleForceSync);

  // Auto-start controls
  document.getElementById('toggleAutoStart').addEventListener('click', handleToggleAutoStart);

  // Update controls
  document.getElementById('checkForUpdates').addEventListener('click', handleCheckForUpdates);
  document.getElementById('downloadUpdate').addEventListener('click', handleDownloadUpdate);
  document.getElementById('installUpdate').addEventListener('click', handleInstallUpdate);

  // Listen for sync stats updates
  window.electronAPI.onSyncStats((stats) => {
    displaySyncStats(stats);
    showMessage('Sync stats updated', 'info');
  });

  // Listen for update status updates
  window.electronAPI.onUpdateStatus((status) => {
    updateUpdateStatusUI(status);
  });

  // Initialize update status
  initializeUpdateStatus();

  // Initialize auto-start status
  initializeAutoStartStatus();
}

// Customer Search
async function handleCustomerSearch() {
  const mobile = document.getElementById('customerMobile').value.trim();

  if (!validateMobile(mobile)) {
    showMessage('Please enter a valid 10-digit mobile number', 'error');
    return;
  }

  const button = document.getElementById('searchCustomer');
  button.classList.add('loading');
  button.textContent = 'Searching...';

  try {
    const result = await window.electronAPI.getCustomerProfile(mobile);

    if (result.success) {
      displayCustomerProfile(result.data);
      showMessage('Customer found successfully', 'success');
    } else {
      showMessage(result.error || 'Customer not found', 'error');
      hideElement('customerResult');
    }
  } catch (error) {
    showMessage('Error fetching customer profile', 'error');
    console.error(error);
  } finally {
    button.classList.remove('loading');
    button.textContent = 'Search Customer';
  }
}

function displayCustomerProfile(data) {
  document.getElementById('custName').textContent = data.fullName || '-';
  document.getElementById('custMobile').textContent = data.mobileNumber || '-';
  document.getElementById('custPoints').textContent = data.currentLoyaltyPoints || 0;
  document.getElementById('custPurchases').textContent = data.totalAmountSpent || 0;
  showElement('customerResult');
}

// Coupon Validation
async function handleCouponValidation() {
  const couponCode = document.getElementById('couponCode').value.trim().toUpperCase();
  const mobile = document.getElementById('couponMobile').value.trim();
  const purchaseAmount = document.getElementById('purchaseAmount').value.trim();

  if (!couponCode) {
    showMessage('Please enter a coupon code', 'error');
    return;
  }

  if (mobile && !validateMobile(mobile)) {
    showMessage('Please enter a valid 10-digit mobile number', 'error');
    return;
  }

  if (!purchaseAmount) {
    showMessage('Please enter a purchase amount', 'error');
    return;
  }

  const button = document.getElementById('validateCoupon');
  button.classList.add('loading');
  button.textContent = 'Validating...';

  try {
    const result = await window.electronAPI.validateCoupon(couponCode, mobile || null, purchaseAmount);
    if (result.success) {
      if (result.data.requireOtpValidation) {
        showOTPContainer();
      } else {
        displayRedeemButton();
      }
      showMessage(result.data.message, 'success');
    } else {
      showMessage(result.error || 'Invalid coupon', 'error');
      hideElement('redeemCouponBtn');
    }
  } catch (error) {
    showMessage('Error validating coupon', 'error');
    console.error(error);
  } finally {
    button.classList.remove('loading');
    button.textContent = 'Validate Coupon';
  }
}

async function handleSendOtpCoupon() {
  const couponCode = document.getElementById('couponCode').value.trim().toUpperCase();
  const mobile = document.getElementById('couponMobile').value.trim();

  if (!couponCode) {
    showMessage('Please enter a coupon code', 'error');
    return;
  }

  if (mobile && !validateMobile(mobile)) {
    showMessage('Please enter a valid 10-digit mobile number', 'error');
    return;
  }

  const button = document.getElementById('sendOtpCoupon');
  button.classList.add('loading');
  button.textContent = 'Sending OTP...';

  try {
    const result = await window.electronAPI.sendOtpCoupon(couponCode, mobile || null);
    if (result.success) {
      // Store the referenceNumber from the response
      storedReferenceNumber = result.data.referenceNumber || null;
      showMessage(result.data.message, 'success');
      showValidateOtpContainer();
    } else {
      showMessage(result.error || 'Failed to send OTP', 'error');
      hideElement('sendOtpCoupon');
      storedReferenceNumber = null; // Clear stored reference number on error
    }
  } catch (error) {
    showMessage('Error sending OTP', 'error');
    console.error(error);
    storedReferenceNumber = null; // Clear stored reference number on error
  } finally {
    button.classList.remove('loading');
    button.textContent = 'Send OTP';
  }
}

function displayRedeemButton() {
  showElement('redeemCouponGroup');
}

function showOTPContainer() {
  showElement('sendOtpCoupon');
}

function showValidateOtpContainer() {
  showElement('otpValidationGroup');
}

async function handleValidateCouponOtp() {
  const couponCode = document.getElementById('couponCode').value.trim().toUpperCase();
  const mobile = document.getElementById('couponMobile').value.trim();
  const otp = document.getElementById('couponOtp').value.trim();

  if (!couponCode) {
    showMessage('Please enter a coupon code', 'error');
    return;
  }

  if (!otp) {
    showMessage('Please enter the OTP', 'error');
    return;
  }

  if (!storedReferenceNumber) {
    showMessage('Reference number not found. Please send OTP again', 'error');
    return;
  }

  const button = document.getElementById('validateCouponOtp');
  button.classList.add('loading');
  button.textContent = 'Validating OTP...';

  try {
    const result = await window.electronAPI.validateOtpCoupon(couponCode, mobile || null, otp, storedReferenceNumber);
    if (result.success) {
      showMessage(result.data.message || 'OTP validated successfully', 'success');
      displayRedeemButton();
      document.getElementById('couponOtp').value = '';
      hideElement('otpValidationGroup');
      hideElement('sendOtpCoupon');
    } else {
      showMessage(result.error || 'OTP validation failed', 'error');
      hideElement('otpValidationGroup');
      hideElement('sendOtpCoupon');
    }
  } catch (error) {
    showMessage('Error validating OTP', 'error');
    console.error(error);
  } finally {
    button.classList.remove('loading');
    button.textContent = 'Validate OTP';
  }
}

async function handleRedeemCoupon() {
  const couponCode = document.getElementById('couponCode').value.trim().toUpperCase();
  const mobile = document.getElementById('couponMobile').value.trim();
  const purchaseAmount = document.getElementById('purchaseAmount').value.trim();
  const receiptNo = document.getElementById('receiptNo').value.trim();

  if (!couponCode) {
    showMessage('Please enter a coupon code', 'error');
    return;
  }
  if (!mobile) {
    showMessage('Please enter a mobile number', 'error');
    return;
  }
  if (!purchaseAmount) {
    showMessage('Please enter a purchase amount', 'error');
    return;
  }

  const button = document.getElementById('redeemCouponBtn');
  button.classList.add('loading');
  button.textContent = 'Redeeming...';

  try {
    const result = await window.electronAPI.redeemCoupon(couponCode, mobile, purchaseAmount, receiptNo);
    if (result.success) {
      showMessage(result.data.message || 'Coupon redeemed successfully', 'success');
    } else {
      showMessage(result.error || 'Failed to redeem coupon', 'error');
    }
    document.getElementById('couponCode').value = '';
    document.getElementById('couponMobile').value = '';
    document.getElementById('purchaseAmount').value = '';
    document.getElementById('receiptNo').value = '';
    hideElement('redeemCouponGroup');
  } catch (error) {
    showMessage('Error redeeming coupon', 'error');
    console.error(error);
  } finally {
    button.classList.remove('loading');
    button.textContent = 'Redeem Coupon';
  }
}
// Loyalty Check
async function handleLoyaltyCheck() {
  const mobile = document.getElementById('loyaltyMobile').value.trim();

  if (!validateMobile(mobile)) {
    showMessage('Please enter a valid 10-digit mobile number', 'error');
    return;
  }

  const button = document.getElementById('checkLoyalty');
  button.classList.add('loading');
  button.textContent = 'Checking...';

  try {
    const result = await window.electronAPI.getLoyaltyPoints(mobile);

    if (result.success) {
      displayLoyaltyInfo(result.data);
      showMessage(result.data.message, 'success');
    } else {
      showMessage(result.error || 'No loyalty information found', 'error');
      hideElement('loyaltyResult');
    }
  } catch (error) {
    showMessage('Error fetching loyalty information', 'error');
    console.error(error);
  } finally {
    button.classList.remove('loading');
    button.textContent = 'Check Loyalty Points';
  }
}

async function handleLoyaltyRedemption() {
  const mobile = document.getElementById('loyaltyMobile').value.trim();
  const receiptNo = document.getElementById('receiptNo').value.trim();
  const points = document.getElementById('loyalPoints').value.trim();

  if (!validateMobile(mobile)) {
    showMessage('Please enter a valid 10-digit mobile number', 'error');
    return;
  }

  const button = document.getElementById('loyaltyRedemption');
  button.classList.add('loading');
  button.textContent = 'Redeeming...';

  try {
    const result = await window.electronAPI.loyaltyRedemptions(mobile, receiptNo, points);

    if (result.success) {
      displayLoyaltyInfo(result.data);
      showMessage('Loyalty redemption successful', 'success');
    } else {
      showMessage(result.error || 'Loyalty redemption failed', 'error');
      hideElement('loyaltyRedemption');
    }
  } catch (error) {
    showMessage('Error redeeming loyalty points', 'error');
    console.error(error);
  } finally {
    button.classList.remove('loading');
    button.textContent = 'Redeem Points';
    hideElement('loyaltyRedeem');
    hideElement('loyaltyResult');
    // Clear input fields by value property
    document.getElementById('loyaltyMobile').value = '';
    document.getElementById('billAmount').value = '';
    document.getElementById('receiptNo').value = '';
    document.getElementById('loyalPoints').value = '';
  }
}

function displayLoyaltyInfo(data) {
  document.getElementById('loyaltyPoints').textContent = data.redeemablePoints || 0;
  showElement('loyaltyRedeem');
  showElement('loyaltyResult');
}

// Sync Status
async function updateSyncStatus() {
  try {
    const [syncStats] = await Promise.all([window.electronAPI.getSyncStats()]);

    if (syncStats) {
      displaySyncStats(syncStats);
    }

    // Update SQL status
    const sqlStatusEl = document.getElementById('sqlStatus');
    sqlStatusEl.textContent = 'Connected';
    sqlStatusEl.classList.remove('error');
    sqlStatusEl.classList.add('highlight');

    // Update header status
    updateHeaderStatus(syncStats);
  } catch (error) {
    console.error('Error updating sync status:', error);
  }
}

function displaySyncStats(stats) {
  document.getElementById('syncStatusText').textContent = stats.isSyncing ? 'Syncing...' : 'Idle';
  document.getElementById('lastSyncTime').textContent = stats.lastSyncTime
    ? new Date(stats.lastSyncTime).toLocaleString()
    : 'Never';
  document.getElementById('totalSynced').textContent = stats.totalSynced || 0;
  document.getElementById('totalFailed').textContent = stats.failedCount || 0;
  document.getElementById('lastSyncedReceiptNo').textContent = stats.lastSyncedReceiptNo || '-';
  document.getElementById('lastReceiptOnServer').textContent = stats.lastReceiptOnServer || '-';
}

function updateHeaderStatus(stats) {
  const indicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');

  if (stats && stats.isSyncing) {
    indicator.className = 'status-indicator syncing';
    statusText.textContent = 'Syncing...';
  } else if (stats && stats.lastError) {
    indicator.className = 'status-indicator error';
    statusText.textContent = 'Sync Error';
  } else {
    indicator.className = 'status-indicator';
    statusText.textContent = 'Idle';
  }
}

async function handleForceSync() {
  const button = document.getElementById('forceSyncNow');
  button.classList.add('loading');
  button.textContent = 'Syncing...';

  try {
    const result = await window.electronAPI.triggerSync();

    if (result.success) {
      showMessage('Sync started successfully', 'success');
      setTimeout(updateSyncStatus, 2000);
    } else {
      showMessage(result.error || 'Failed to start sync', 'error');
    }
  } catch (error) {
    showMessage('Error triggering sync', 'error');
    console.error(error);
  } finally {
    button.classList.remove('loading');
    button.textContent = 'Sync Now';
  }
}

// Utility Functions
function validateMobile(mobile) {
  return /^[0-9]{10}$/.test(mobile);
}

function showElement(id) {
  document.getElementById(id).style.display = 'block';
}

function hideElement(id) {
  document.getElementById(id).style.display = 'none';
}

function showMessage(text, type = 'info') {
  const container = document.getElementById('messageContainer');
  const message = document.createElement('div');
  message.className = `message ${type}`;
  message.textContent = text;

  container.appendChild(message);

  setTimeout(() => {
    message.style.opacity = '0';
    setTimeout(() => message.remove(), 300);
  }, 3000);
}

// Auto-refresh sync status every 30 seconds
setInterval(() => {
  if (currentTab === 'sync') {
    updateSyncStatus();
  }
}, 30000);

// Update Status Functions
async function initializeUpdateStatus() {
  try {
    const status = await window.electronAPI.getUpdateStatus();
    if (status) {
      document.getElementById('currentVersion').textContent = status.currentVersion || 'Unknown';
      updateUpdateStatusUI({
        status: status.downloaded ? 'downloaded' : status.available ? 'available' : 'not-available',
        version: status.version,
        error: status.error
      });
    }
  } catch (error) {
    console.error('Failed to get update status:', error);
  }
}

function updateUpdateStatusUI(statusData) {
  const statusText = document.getElementById('updateStatusText');
  const downloadBtn = document.getElementById('downloadUpdate');
  const installBtn = document.getElementById('installUpdate');
  const progressContainer = document.getElementById('updateProgress');
  const progressFill = document.getElementById('updateProgressFill');
  const progressText = document.getElementById('updateProgressText');

  switch (statusData.status) {
    case 'checking':
      statusText.textContent = 'Checking for updates...';
      statusText.className = 'value';
      downloadBtn.style.display = 'none';
      installBtn.style.display = 'none';
      progressContainer.style.display = 'none';
      break;

    case 'available':
      statusText.textContent = `Update ${statusData.version} available`;
      statusText.className = 'value highlight';
      downloadBtn.style.display = 'inline-block';
      installBtn.style.display = 'none';
      progressContainer.style.display = 'none';
      showMessage(`Update ${statusData.version} is available`, 'info');
      break;

    case 'downloading':
      statusText.textContent = `Downloading update ${statusData.version}...`;
      statusText.className = 'value';
      downloadBtn.style.display = 'none';
      installBtn.style.display = 'none';
      progressContainer.style.display = 'block';
      const progress = Math.round(statusData.progress || 0);
      progressFill.style.width = `${progress}%`;
      progressText.textContent = `${progress}%`;
      break;

    case 'downloaded':
      statusText.textContent = `Update ${statusData.version} downloaded`;
      statusText.className = 'value highlight';
      downloadBtn.style.display = 'none';
      installBtn.style.display = 'inline-block';
      progressContainer.style.display = 'none';
      showMessage('Update downloaded. Click "Restart & Install" to apply.', 'info');
      break;

    case 'not-available':
      statusText.textContent = 'You are using the latest version';
      statusText.className = 'value';
      downloadBtn.style.display = 'none';
      installBtn.style.display = 'none';
      progressContainer.style.display = 'none';
      break;

    case 'error':
      statusText.textContent = `Update error: ${statusData.error || 'Unknown error'}`;
      statusText.className = 'value error';
      downloadBtn.style.display = 'none';
      installBtn.style.display = 'none';
      progressContainer.style.display = 'none';
      showMessage(`Update error: ${statusData.error}`, 'error');
      break;

    default:
      statusText.textContent = 'Unknown status';
      statusText.className = 'value';
      downloadBtn.style.display = 'none';
      installBtn.style.display = 'none';
      progressContainer.style.display = 'none';
  }
}

async function handleCheckForUpdates() {
  const button = document.getElementById('checkForUpdates');
  button.classList.add('loading');
  button.textContent = 'Checking...';
  button.disabled = true;

  try {
    const result = await window.electronAPI.checkForUpdates();
    if (result.success) {
      showMessage('Checking for updates...', 'info');
    } else {
      showMessage(`Failed to check for updates: ${result.error}`, 'error');
    }
  } catch (error) {
    showMessage(`Error: ${error.message}`, 'error');
  } finally {
    button.classList.remove('loading');
    button.textContent = 'Check for Updates';
    button.disabled = false;
  }
}

async function handleDownloadUpdate() {
  const button = document.getElementById('downloadUpdate');
  button.classList.add('loading');
  button.textContent = 'Downloading...';
  button.disabled = true;

  try {
    const result = await window.electronAPI.downloadUpdate();
    if (result.success) {
      showMessage('Download started...', 'info');
    } else {
      showMessage(`Failed to download update: ${result.error}`, 'error');
      button.classList.remove('loading');
      button.textContent = 'Download Update';
      button.disabled = false;
    }
  } catch (error) {
    showMessage(`Error: ${error.message}`, 'error');
    button.classList.remove('loading');
    button.textContent = 'Download Update';
    button.disabled = false;
  }
}

async function handleInstallUpdate() {
  const button = document.getElementById('installUpdate');
  button.classList.add('loading');
  button.textContent = 'Restarting...';
  button.disabled = true;

  try {
    const result = await window.electronAPI.installUpdate();
    if (result.success) {
      showMessage('Restarting to install update...', 'info');
    } else {
      showMessage(`Failed to install update: ${result.error}`, 'error');
      button.classList.remove('loading');
      button.textContent = 'Restart & Install';
      button.disabled = false;
    }
  } catch (error) {
    showMessage(`Error: ${error.message}`, 'error');
    button.classList.remove('loading');
    button.textContent = 'Restart & Install';
    button.disabled = false;
  }
}

// Auto-start Functions
async function initializeAutoStartStatus() {
  try {
    const status = await window.electronAPI.getAutoStartStatus();
    if (status.success !== false) {
      updateAutoStartUI(status.enabled);
    } else {
      document.getElementById('autoStartStatus').textContent = 'Error checking status';
      document.getElementById('autoStartStatus').className = 'value error';
    }
  } catch (error) {
    console.error('Failed to get auto-start status:', error);
    document.getElementById('autoStartStatus').textContent = 'Error';
    document.getElementById('autoStartStatus').className = 'value error';
  }
}

function updateAutoStartUI(enabled) {
  const statusEl = document.getElementById('autoStartStatus');
  const button = document.getElementById('toggleAutoStart');

  if (enabled) {
    statusEl.textContent = 'Enabled';
    statusEl.className = 'value highlight';
    button.textContent = 'Disable Auto-start';
    button.classList.remove('btn-secondary');
    button.classList.add('btn-primary');
  } else {
    statusEl.textContent = 'Disabled';
    statusEl.className = 'value';
    button.textContent = 'Enable Auto-start';
    button.classList.remove('btn-primary');
    button.classList.add('btn-secondary');
  }
}

async function handleToggleAutoStart() {
  const button = document.getElementById('toggleAutoStart');
  const currentStatus = document.getElementById('autoStartStatus').textContent;
  const isCurrentlyEnabled = currentStatus === 'Enabled';
  const newStatus = !isCurrentlyEnabled;

  button.classList.add('loading');
  button.disabled = true;
  button.textContent = newStatus ? 'Enabling...' : 'Disabling...';

  try {
    const result = await window.electronAPI.setAutoStart(newStatus);
    if (result.success) {
      updateAutoStartUI(result.enabled);
      showMessage(`Auto-start ${result.enabled ? 'enabled' : 'disabled'} successfully`, 'success');
    } else {
      showMessage(`Failed to ${newStatus ? 'enable' : 'disable'} auto-start: ${result.error}`, 'error');
    }
  } catch (error) {
    showMessage(`Error: ${error.message}`, 'error');
    console.error('Failed to toggle auto-start:', error);
  } finally {
    button.classList.remove('loading');
    button.disabled = false;
    // Button text will be updated by updateAutoStartUI
  }
}
