// App state
let currentTab = 'customer';

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

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.tab;

      // Update active states
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));

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
  document.getElementById('couponCode').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleCouponValidation();
  });

  // Loyalty points
  document.getElementById('checkLoyalty').addEventListener('click', handleLoyaltyCheck);
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
  document.getElementById('custName').textContent = data.name || '-';
  document.getElementById('custMobile').textContent = data.mobile || '-';
  document.getElementById('custPoints').textContent = data.loyaltyPoints || 0;
  document.getElementById('custPurchases').textContent = data.totalPurchases || 0;

  showElement('customerResult');
}

// Coupon Validation
async function handleCouponValidation() {
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

  const button = document.getElementById('validateCoupon');
  button.classList.add('loading');
  button.textContent = 'Validating...';

  try {
    const result = await window.electronAPI.validateCoupon(couponCode, mobile || null);

    if (result.success) {
      displayCouponDetails(result.data);
      showMessage('Coupon is valid!', 'success');
    } else {
      showMessage(result.error || 'Invalid coupon', 'error');
      hideElement('couponResult');
    }
  } catch (error) {
    showMessage('Error validating coupon', 'error');
    console.error(error);
  } finally {
    button.classList.remove('loading');
    button.textContent = 'Validate Coupon';
  }
}

function displayCouponDetails(data) {
  document.getElementById('cpnCode').textContent = data.code || '-';
  document.getElementById('cpnStatus').textContent = data.status || '-';
  document.getElementById('cpnDiscount').textContent = data.discount
    ? `${data.discountType === 'percentage' ? data.discount + '%' : '₹' + data.discount}`
    : '-';
  document.getElementById('cpnExpiry').textContent = data.expiryDate
    ? new Date(data.expiryDate).toLocaleDateString()
    : '-';

  showElement('couponResult');
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
      showMessage('Loyalty information retrieved', 'success');
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

function displayLoyaltyInfo(data) {
  document.getElementById('loyaltyPoints').textContent = data.availablePoints || 0;
  document.getElementById('pointsEarned').textContent = data.totalEarned || 0;
  document.getElementById('pointsRedeemed').textContent = data.totalRedeemed || 0;
  document.getElementById('tierLevel').textContent = data.tier || 'Bronze';

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
  document.getElementById('syncStatusText').textContent = stats.isSyncing
    ? 'Syncing...'
    : 'Idle';
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
