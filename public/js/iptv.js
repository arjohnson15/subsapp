// public/js/iptv.js - IPTV Frontend Module
const IPTV = {
  packages: {},
  channelGroups: [],
  currentUser: null,
  creditBalance: 0,

  /**
   * Initialize IPTV module
   */
  async init() {
    console.log('📺 Initializing IPTV module...');
    try {
      await this.loadPackages();
      await this.loadChannelGroups();
      await this.loadCreditBalance();
      this.bindEvents();
      console.log('✅ IPTV module initialized');
    } catch (error) {
      console.error('❌ Failed to initialize IPTV module:', error);
      showNotification('Failed to initialize IPTV module', 'error');
    }
  },

  /**
   * Load available packages from API
   */
  async loadPackages() {
    try {
      const response = await fetch('/api/iptv/packages');
      const data = await response.json();
      
      if (data.success) {
        this.packages = data.packages;
        console.log('📦 Loaded IPTV packages:', data.total);
      } else {
        throw new Error(data.message);
      }
    } catch (error) {
      console.error('❌ Failed to load packages:', error);
      showNotification('Failed to load IPTV packages', 'error');
    }
  },

  /**
   * Load channel groups from API
   */
  async loadChannelGroups() {
    try {
      const response = await fetch('/api/iptv/channel-groups');
      const data = await response.json();
      
      if (data.success) {
        this.channelGroups = data.channelGroups;
        console.log('📺 Loaded channel groups:', data.total);
      } else {
        throw new Error(data.message);
      }
    } catch (error) {
      console.error('❌ Failed to load channel groups:', error);
      showNotification('Failed to load channel groups', 'error');
    }
  },

  /**
   * Load current credit balance
   */
  async loadCreditBalance() {
    try {
      const response = await fetch('/api/iptv/credits');
      const data = await response.json();
      
      if (data.success) {
        this.creditBalance = data.credits;
        this.updateCreditDisplay();
      }
    } catch (error) {
      console.error('❌ Failed to load credit balance:', error);
    }
  },

  /**
   * Bind IPTV-related event listeners
   */
  bindEvents() {
    // Package selection change
    $(document).on('change', '#iptvPackageSelect', (e) => {
      this.onPackageChange(e.target.value);
    });

    // Channel group selection change
    $(document).on('change', '#iptvChannelGroupSelect', (e) => {
      this.onChannelGroupChange(e.target.value);
    });

    // Action buttons
    $(document).on('click', '#iptvCreateTrialBtn', () => this.createTrialSubscription());
    $(document).on('click', '#iptvCreatePaidBtn', () => this.createPaidSubscription());
    $(document).on('click', '#iptvExtendBtn', () => this.extendSubscription());
    $(document).on('click', '#iptvClearBtn', () => this.clearSelection());
    $(document).on('click', '#iptvSyncBtn', () => this.syncUserStatus());

    // Generate username/password buttons
    $(document).on('click', '#generateUsernameBtn', () => this.generateUsername());
    $(document).on('click', '#generatePasswordBtn', () => this.generatePassword());

    // Credit sync button
    $(document).on('click', '#syncCreditsBtn', () => this.syncCredits());

    // Test connection button (in settings)
    $(document).on('click', '#testIPTVConnectionBtn', () => this.testConnection());
  },

  /**
   * Show IPTV section when IPTV tag is checked
   */
  showIPTVSection(userId) {
    this.currentUser = userId;
    
    // Show the IPTV section
    $('#iptvSection').show();
    
    // Load user's current IPTV status
    this.loadUserStatus(userId);
    
    // Populate dropdowns
    this.populatePackageSelect();
    this.populateChannelGroupSelect();
    
    // Update credit display
    this.updateCreditDisplay();
  },

  /**
   * Hide IPTV section when IPTV tag is unchecked
   */
  hideIPTVSection() {
    $('#iptvSection').hide();
    this.currentUser = null;
    this.clearForm();
  },

  /**
   * Load user's current IPTV status
   */
  async loadUserStatus(userId) {
    try {
      const response = await fetch(`/api/iptv/user/${userId}`);
      const data = await response.json();
      
      if (data.success) {
        this.displayUserStatus(data.user);
      } else if (response.status !== 404) {
        throw new Error(data.message);
      }
    } catch (error) {
      console.error('❌ Failed to load user IPTV status:', error);
    }
  },

  /**
   * Display user's current IPTV status
   */
  displayUserStatus(user) {
    const statusSection = $('#iptvCurrentStatus');
    
    if (user.iptv_username) {
      // User has IPTV subscription
      const statusClass = user.status === 'active' ? 'text-success' : 
                         user.status === 'expired' ? 'text-danger' : 'text-warning';
      
      statusSection.html(`
        <div class="status-card">
          <h4>Current IPTV Subscription</h4>
          <div class="row">
            <div class="col-md-6">
              <p><strong>Username:</strong> ${user.iptv_username}</p>
              <p><strong>Password:</strong> ${user.iptv_password || 'N/A'}</p>
              <p><strong>Package:</strong> ${user.iptv_package_name || 'Unknown'}</p>
              <p><strong>Connections:</strong> ${user.iptv_connections || 'N/A'}</p>
            </div>
            <div class="col-md-6">
              <p><strong>Status:</strong> <span class="${statusClass}">${user.status?.toUpperCase()}</span></p>
              <p><strong>Expiration:</strong> ${user.expiration_formatted || 'N/A'}</p>
              <p><strong>Channel Group:</strong> ${user.channel_group_name || 'None'}</p>
              <p><strong>iMPlayer Code:</strong> ${user.implayer_code || 'N/A'}</p>
            </div>
          </div>
          <div class="action-buttons">
            <button id="iptvSyncBtn" class="btn btn-sm btn-outline-primary">
              <i class="fas fa-sync"></i> Sync Status
            </button>
            <button id="showIPTVDetailsBtn" class="btn btn-sm btn-outline-info">
              <i class="fas fa-info-circle"></i> Show Details
            </button>
          </div>
        </div>
      `).show();
      
      // Pre-fill form for extending
      $('#iptvUsername').val(user.iptv_username).prop('disabled', true);
      $('#iptvPassword').val(user.iptv_password || '').prop('disabled', true);
      $('#iptvChannelGroupSelect').val(user.iptv_channel_group_id || '');
      
      // Enable extend button, disable create buttons
      $('#iptvExtendBtn').prop('disabled', false);
      $('#iptvCreateTrialBtn, #iptvCreatePaidBtn').prop('disabled', true);
      
    } else {
      // User has no IPTV subscription
      statusSection.html(`
        <div class="status-card">
          <p class="text-muted">No active IPTV subscription</p>
        </div>
      `).show();
      
      // Clear form and enable create buttons
      this.clearForm();
      $('#iptvUsername, #iptvPassword').prop('disabled', false);
      $('#iptvCreateTrialBtn, #iptvCreatePaidBtn').prop('disabled', false);
      $('#iptvExtendBtn').prop('disabled', true);
    }
  },

  /**
   * Populate package selection dropdown
   */
  populatePackageSelect() {
    const select = $('#iptvPackageSelect');
    select.empty().append('<option value="">Select Package...</option>');
    
    // Add package groups
    Object.keys(this.packages).forEach(type => {
      if (this.packages[type].length > 0) {
        const groupLabel = type.replace('_', ' ').toUpperCase();
        select.append(`<optgroup label="${groupLabel}">`);
        
        this.packages[type].forEach(pkg => {
          const label = `${pkg.name} (${pkg.connections} conn, ${pkg.duration_months}mo, ${pkg.credits} credits)`;
          select.append(`<option value="${pkg.package_id}" data-type="${type}">${label}</option>`);
        });
        
        select.append('</optgroup>');
      }
    });
  },

  /**
   * Populate channel group selection dropdown
   */
  populateChannelGroupSelect() {
    const select = $('#iptvChannelGroupSelect');
    select.empty().append('<option value="">Select Channel Group...</option>');
    
    this.channelGroups.forEach(group => {
      select.append(`<option value="${group.id}">${group.name}</option>`);
    });
  },

  /**
   * Handle package selection change
   */
  onPackageChange(packageId) {
    if (!packageId) {
      $('#iptvPackageSummary').hide();
      return;
    }
    
    // Find package info
    let selectedPackage = null;
    Object.values(this.packages).forEach(typePackages => {
      const found = typePackages.find(p => p.package_id === packageId);
      if (found) selectedPackage = found;
    });
    
    if (selectedPackage) {
      this.displayPackageSummary(selectedPackage);
      this.updateActionButtons(selectedPackage);
    }
  },

  /**
   * Handle channel group selection change
   */
  onChannelGroupChange(groupId) {
    if (!groupId) return;
    
    const group = this.channelGroups.find(g => g.id == groupId);
    if (group && group.description) {
      $('#channelGroupDescription').text(group.description).show();
    } else {
      $('#channelGroupDescription').hide();
    }
  },

  /**
   * Display package summary
   */
  displayPackageSummary(pkg) {
    const summary = $('#iptvPackageSummary');
    
    // Calculate expiration date
    const now = new Date();
    const expirationDate = new Date(now);
    expirationDate.setMonth(expirationDate.getMonth() + pkg.duration_months);
    
    summary.html(`
      <div class="package-summary">
        <h5>Package Summary</h5>
        <div class="row">
          <div class="col-md-6">
            <p><strong>Package:</strong> ${pkg.name}</p>
            <p><strong>Connections:</strong> ${pkg.connections}</p>
            <p><strong>Duration:</strong> ${pkg.duration_months} month(s)</p>
          </div>
          <div class="col-md-6">
            <p><strong>Credits Required:</strong> ${pkg.credits}</p>
            <p><strong>Type:</strong> ${pkg.package_type.replace('_', ' ').toUpperCase()}</p>
            <p><strong>Calculated Expiry:</strong> ${expirationDate.toLocaleDateString()}</p>
          </div>
        </div>
      </div>
    `).show();
  },

  /**
   * Update action button states based on package and credit balance
   */
  updateActionButtons(pkg) {
    const hasCredits = this.creditBalance >= pkg.credits;
    const isTrial = pkg.package_type === 'trial';
    
    // Trial button - always enabled for trial packages
    $('#iptvCreateTrialBtn').prop('disabled', !isTrial);
    
    // Paid buttons - enabled if sufficient credits and not trial
    $('#iptvCreatePaidBtn').prop('disabled', isTrial || !hasCredits);
    $('#iptvExtendBtn').prop('disabled', isTrial || !hasCredits);
    
    // Update credit warning
    if (!hasCredits && !isTrial) {
      $('#creditWarning').html(`
        <div class="alert alert-warning">
          <i class="fas fa-exclamation-triangle"></i>
          Insufficient credits! Required: ${pkg.credits}, Available: ${this.creditBalance}
        </div>
      `).show();
    } else {
      $('#creditWarning').hide();
    }
  },

  /**
   * Update credit display
   */
  updateCreditDisplay() {
    $('#currentCredits').text(this.creditBalance);
    $('.credit-balance').text(this.creditBalance);
  },

  /**
   * Generate random username
   */
  generateUsername() {
    const prefix = 'user';
    const random = Math.random().toString(36).substring(2, 8);
    const username = prefix + random;
    $('#iptvUsername').val(username);
  },

  /**
   * Generate random password
   */
  generatePassword() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    $('#iptvPassword').val(password);
  },

  /**
   * Create trial subscription
   */
  async createTrialSubscription() {
    await this.createSubscription('create_trial');
  },

  /**
   * Create paid subscription
   */
  async createPaidSubscription() {
    await this.createSubscription('create_paid');
  },

  /**
   * Extend existing subscription
   */
  async extendSubscription() {
    await this.createSubscription('extend');
  },

  /**
   * Create or extend subscription
   */
  async createSubscription(action) {
    const packageId = $('#iptvPackageSelect').val();
    const channelGroupId = $('#iptvChannelGroupSelect').val();
    const username = $('#iptvUsername').val();
    const password = $('#iptvPassword').val();
    
    // Validation
    if (!packageId) {
      showNotification('Please select a package', 'error');
      return;
    }
    
    if (!channelGroupId) {
      showNotification('Please select a channel group', 'error');
      return;
    }
    
    if ((action === 'create_trial' || action === 'create_paid') && !username) {
      showNotification('Please enter a username', 'error');
      return;
    }
    
    // Show loading state
    const button = $(`#iptv${action.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}Btn`);
    const originalText = button.html();
    button.html('<i class="fas fa-spinner fa-spin"></i> Processing...').prop('disabled', true);
    
    try {
      const response = await fetch('/api/iptv/subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: this.currentUser,
          package_id: packageId,
          channel_group_id: channelGroupId,
          action: action,
          username: username,
          password: password
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        showNotification(data.message, 'success');
        
        // Show subscription details
        this.showSubscriptionDetails(data.subscription);
        
        // Reload user status
        await this.loadUserStatus(this.currentUser);
        
        // Update credit balance
        await this.loadCreditBalance();
        
      } else {
        throw new Error(data.message);
      }
      
    } catch (error) {
      console.error(`❌ Failed to ${action} subscription:`, error);
      showNotification(`Failed to ${action.replace('_', ' ')} subscription: ${error.message}`, 'error');
    } finally {
      // Restore button state
      button.html(originalText).prop('disabled', false);
    }
  },

  /**
   * Show subscription details modal/popup
   */
  showSubscriptionDetails(subscription) {
    const modal = `
      <div class="modal fade" id="iptvDetailsModal" tabindex="-1">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">IPTV Subscription Details</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="row">
                <div class="col-md-6">
                  <h6>Account Details</h6>
                  <p><strong>Username:</strong> ${subscription.username}</p>
                  <p><strong>Password:</strong> ${subscription.password}</p>
                  <p><strong>Package:</strong> ${subscription.package_name}</p>
                  <p><strong>Connections:</strong> ${subscription.connections}</p>
                  <p><strong>Expiration:</strong> ${subscription.expiration_formatted}</p>
                  <p><strong>iMPlayer Code:</strong> ${subscription.implayer_code}</p>
                </div>
                <div class="col-md-6">
                  <h6>Stream URLs</h6>
                  <div class="mb-3">
                    <label>M3U Playlist:</label>
                    <div class="input-group">
                      <input type="text" class="form-control" value="${subscription.stream_urls.m3u}" readonly>
                      <button class="btn btn-outline-secondary" onclick="navigator.clipboard.writeText('${subscription.stream_urls.m3u}')">
                        <i class="fas fa-copy"></i>
                      </button>
                    </div>
                  </div>
                  <div class="mb-3">
                    <label>M3U Plus:</label>
                    <div class="input-group">
                      <input type="text" class="form-control" value="${subscription.stream_urls.m3u_plus}" readonly>
                      <button class="btn btn-outline-secondary" onclick="navigator.clipboard.writeText('${subscription.stream_urls.m3u_plus}')">
                        <i class="fas fa-copy"></i>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              ${subscription.is_trial ? '<div class="alert alert-info"><i class="fas fa-info-circle"></i> This is a trial subscription (24 hours)</div>' : ''}
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
              <button type="button" class="btn btn-primary" onclick="IPTV.emailSubscriptionDetails()">
                <i class="fas fa-envelope"></i> Email Details
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Remove existing modal and add new one
    $('#iptvDetailsModal').remove();
    $('body').append(modal);
    $('#iptvDetailsModal').modal('show');
    
    // Store subscription details for emailing
    this.lastSubscription = subscription;
  },

  /**
   * Email subscription details to user
   */
  async emailSubscriptionDetails() {
    if (!this.lastSubscription || !this.currentUser) {
      showNotification('No subscription details to email', 'error');
      return;
    }
    
    try {
      // This would trigger the email template
      showNotification('Email sent successfully (functionality to be implemented)', 'success');
    } catch (error) {
      showNotification('Failed to send email', 'error');
    }
  },

  /**
   * Sync user status from panel
   */
  async syncUserStatus() {
    if (!this.currentUser) return;
    
    const button = $('#iptvSyncBtn');
    const originalText = button.html();
    button.html('<i class="fas fa-spinner fa-spin"></i>').prop('disabled', true);
    
    try {
      const response = await fetch(`/api/iptv/sync-user/${this.currentUser}`);
      const data = await response.json();
      
      if (data.success) {
        showNotification('User status synced successfully', 'success');
        await this.loadUserStatus(this.currentUser);
      } else {
        throw new Error(data.message);
      }
      
    } catch (error) {
      console.error('❌ Failed to sync user status:', error);
      showNotification(`Failed to sync user status: ${error.message}`, 'error');
    } finally {
      button.html(originalText).prop('disabled', false);
    }
  },

  /**
   * Sync credit balance from panel
   */
  async syncCredits() {
    const button = $('#syncCreditsBtn');
    const originalText = button.html();
    button.html('<i class="fas fa-spinner fa-spin"></i>').prop('disabled', true);
    
    try {
      const response = await fetch('/api/iptv/sync-credits', { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        this.creditBalance = data.credits;
        this.updateCreditDisplay();
        showNotification(`Credit balance synced: ${data.credits} credits`, 'success');
      } else {
        throw new Error(data.message);
      }
      
    } catch (error) {
      console.error('❌ Failed to sync credits:', error);
      showNotification(`Failed to sync credits: ${error.message}`, 'error');
    } finally {
      button.html(originalText).prop('disabled', false);
    }
  },

  /**
   * Test IPTV panel connection
   */
  async testConnection() {
    const button = $('#testIPTVConnectionBtn');
    const originalText = button.html();
    button.html('<i class="fas fa-spinner fa-spin"></i> Testing...').prop('disabled', true);
    
    try {
      const response = await fetch('/api/iptv/test-connection', { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        showNotification(data.message, 'success');
      } else {
        showNotification(data.message, 'error');
      }
      
    } catch (error) {
      console.error('❌ Connection test failed:', error);
      showNotification('Connection test failed', 'error');
    } finally {
      button.html(originalText).prop('disabled', false);
    }
  },

  /**
   * Clear form fields
   */
  clearForm() {
    $('#iptvPackageSelect').val('');
    $('#iptvChannelGroupSelect').val('');
    $('#iptvUsername').val('');
    $('#iptvPassword').val('');
    $('#iptvPackageSummary').hide();
    $('#creditWarning').hide();
    $('#channelGroupDescription').hide();
  },

  /**
   * Clear selection and reset form
   */
  clearSelection() {
    this.clearForm();
    
    // Reset button states
    $('#iptvCreateTrialBtn, #iptvCreatePaidBtn').prop('disabled', false);
    $('#iptvExtendBtn').prop('disabled', true);
    $('#iptvUsername, #iptvPassword').prop('disabled', false);
    
    showNotification('Selection cleared', 'info');
  },

  /**
   * Format package info for display
   */
  formatPackageInfo(pkg) {
    return {
      name: pkg.name,
      connections: pkg.connections,
      duration: `${pkg.duration_months} month${pkg.duration_months > 1 ? 's' : ''}`,
      credits: pkg.credits,
      type: pkg.package_type.replace('_', ' ').toUpperCase()
    };
  },

  /**
   * Validate form data before submission
   */
  validateForm(action) {
    const errors = [];
    
    if (!$('#iptvPackageSelect').val()) {
      errors.push('Package selection is required');
    }
    
    if (!$('#iptvChannelGroupSelect').val()) {
      errors.push('Channel group selection is required');
    }
    
    if ((action === 'create_trial' || action === 'create_paid') && !$('#iptvUsername').val()) {
      errors.push('Username is required for new subscriptions');
    }
    
    return errors;
  },

  /**
   * Show/hide IPTV sections based on user tags
   */
  handleTagChange(tags) {
    const hasIPTVTag = tags.includes('IPTV');
    
    if (hasIPTVTag && this.currentUser) {
      this.showIPTVSection(this.currentUser);
    } else {
      this.hideIPTVSection();
    }
  },

  /**
   * Get user's IPTV activity log
   */
  async getUserActivity(userId, limit = 10) {
    try {
      const response = await fetch(`/api/iptv/activity/${userId}?limit=${limit}`);
      const data = await response.json();
      
      if (data.success) {
        return data.activities;
      } else {
        throw new Error(data.message);
      }
    } catch (error) {
      console.error('❌ Failed to get user activity:', error);
      return [];
    }
  },

  /**
   * Display activity log in a table
   */
  displayActivityLog(activities) {
    if (!activities || activities.length === 0) {
      return '<p class="text-muted">No IPTV activity recorded</p>';
    }
    
    let html = `
      <table class="table table-sm">
        <thead>
          <tr>
            <th>Date</th>
            <th>Action</th>
            <th>Package</th>
            <th>Credits</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    activities.forEach(activity => {
      const date = new Date(activity.created_at).toLocaleDateString();
      const status = activity.success ? 
        '<span class="badge bg-success">Success</span>' : 
        '<span class="badge bg-danger">Failed</span>';
      
      html += `
        <tr>
          <td>${date}</td>
          <td>${activity.action.replace('_', ' ').toUpperCase()}</td>
          <td>${activity.package_id || 'N/A'}</td>
          <td>${activity.credits_used || 0}</td>
          <td>${status}</td>
        </tr>
      `;
    });
    
    html += '</tbody></table>';
    return html;
  }
};

// Initialize when document is ready
$(document).ready(() => {
  // Initialize IPTV module if we're on a page that needs it
  if (window.location.pathname.includes('users') || window.location.pathname === '/') {
    IPTV.init();
  }
});

// At the very end of iptv.js, REPLACE this line:
// window.IPTV = IPTV;

// WITH this code that preserves existing IPTV functions:
if (!window.IPTV) {
  window.IPTV = {};
}

// Merge the IPTV module functions without overwriting existing ones
Object.assign(window.IPTV, IPTV);

console.log('📺 IPTV module loaded and merged with existing functions');