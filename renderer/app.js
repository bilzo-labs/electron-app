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

  // Listen for sync stats updates
  window.electronAPI.onSyncStats((stats) => {
    displaySyncStats(stats);
    showMessage('Sync stats updated', 'info');
  });
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
    const [syncStats, sqlHealth] = await Promise.all([
      window.electronAPI.getSyncStats(),
      window.electronAPI.checkSqlHealth()
    ]);

    if (syncStats) {
      displaySyncStats(syncStats);
    }

    // Update SQL status
    const sqlStatusEl = document.getElementById('sqlStatus');
    if (sqlHealth.connected) {
      sqlStatusEl.textContent = 'Connected';
      sqlStatusEl.classList.remove('error');
      sqlStatusEl.classList.add('highlight');
    } else {
      sqlStatusEl.textContent = 'Disconnected';
      sqlStatusEl.classList.remove('highlight');
      sqlStatusEl.classList.add('error');
    }

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
