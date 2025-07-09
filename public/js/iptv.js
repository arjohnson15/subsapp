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
  },

  // ===========================================
  // SETTINGS PAGE FUNCTIONS - CHANNEL GROUPS
  // ===========================================

  /**
   * Show channel group creation form (Fixed for settings page)
   */
  showChannelGroupForm() {
    console.log('📋 Opening channel group form...');
    
    // Show the form that's already in the settings page instead of creating a modal
    const form = document.getElementById('channelGroupForm');
    if (form) {
      form.style.display = 'block';
      document.getElementById('channelGroupFormTitle').textContent = 'Create New Channel Group';
      
      // Clear the form
      document.getElementById('channelGroupName').value = '';
      document.getElementById('channelGroupDescription').value = '';
      
      // Load bouquets for selection
      this.loadBouquetsForSelection();
      
      // Scroll to form
      form.scrollIntoView({ behavior: 'smooth' });
    } else {
      console.error('❌ Channel group form not found in settings page');
      showNotification('Channel group form not found', 'error');
    }
  },

  /**
   * Hide channel group form
   */
  hideChannelGroupForm() {
    const form = document.getElementById('channelGroupForm');
    if (form) {
      form.style.display = 'none';
    }
  },

  /**
   * Load bouquets for selection (for settings page form)
   */
  async loadBouquetsForSelection() {
    try {
      console.log('📺 Loading bouquets for selection...');
      
      const response = await fetch('/api/iptv/bouquets');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      const bouquets = data.bouquets || data; // Handle both response formats
      
      console.log(`✅ Loaded bouquets for selection:`, bouquets);
      
      const container = document.getElementById('bouquetSelectionContainer');
      if (!container) {
        console.error('❌ Bouquet selection container not found');
        return;
      }
      
      // Clear existing content
      container.innerHTML = '';
      
      // Create bouquet selection interface
      Object.keys(bouquets).forEach(category => {
        const categoryDiv = document.createElement('div');
        categoryDiv.style.marginBottom = '15px';
        
        // Category header with select all button
        const categoryHeader = document.createElement('div');
        categoryHeader.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding: 8px; background: rgba(0,0,0,0.4); border-radius: 4px;';
        categoryHeader.innerHTML = `
          <span style="color: #4fc3f7; font-weight: bold;">${category} (${bouquets[category].length})</span>
          <button type="button" class="btn btn-sm" style="background: #4fc3f7; color: #000; padding: 4px 8px; font-size: 0.75rem;" onclick="IPTV.selectCategoryBouquets('${category}')">
            Select All
          </button>
        `;
        categoryDiv.appendChild(categoryHeader);
        
        // Bouquets in this category
        const bouquetsGrid = document.createElement('div');
        bouquetsGrid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; margin-left: 15px;';
        
        bouquets[category].forEach(bouquet => {
          const bouquetDiv = document.createElement('div');
          bouquetDiv.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 6px; background: rgba(255,255,255,0.05); border-radius: 4px;';
          
          bouquetDiv.innerHTML = `
            <input type="checkbox" id="bouquet_${bouquet.id}" value="${bouquet.id}" data-category="${category}" style="margin: 0;">
            <label for="bouquet_${bouquet.id}" style="color: #fff; cursor: pointer; font-size: 0.85rem; margin: 0; flex: 1;">${bouquet.name}</label>
          `;
          
          bouquetsGrid.appendChild(bouquetDiv);
        });
        
        categoryDiv.appendChild(bouquetsGrid);
        container.appendChild(categoryDiv);
      });
      
    } catch (error) {
      console.error('❌ Failed to load bouquets for selection:', error);
      const container = document.getElementById('bouquetSelectionContainer');
      if (container) {
        container.innerHTML = '<div style="text-align: center; color: #f44336; padding: 20px;">Failed to load bouquets</div>';
      }
    }
  },

  /**
   * Select all bouquets in a category
   */
  selectCategoryBouquets(category) {
    const checkboxes = document.querySelectorAll(`input[data-category="${category}"]`);
    checkboxes.forEach(checkbox => {
      checkbox.checked = true;
    });
    showNotification(`Selected all ${category} bouquets`, 'success');
  },

  /**
   * Select all bouquets
   */
  selectAllBouquets() {
    const checkboxes = document.querySelectorAll('#bouquetSelectionContainer input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      checkbox.checked = true;
    });
    showNotification('Selected all bouquets', 'success');
  },

  /**
   * Clear all bouquet selections
   */
  clearAllBouquets() {
    const checkboxes = document.querySelectorAll('#bouquetSelectionContainer input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      checkbox.checked = false;
    });
    showNotification('Cleared all selections', 'info');
  },

  /**
   * Save channel group (updated for settings page form)
   */
  async saveChannelGroup(event) {
    if (event) {
      event.preventDefault();
    }
    
    try {
      const form = document.getElementById('channelGroupForm');
      const editingId = form.getAttribute('data-editing-id');
      const isEditing = !!editingId;
      
      const name = document.getElementById('channelGroupName').value.trim();
      const description = document.getElementById('channelGroupDescription').value.trim();
      
      // Get selected bouquet IDs
      const selectedCheckboxes = document.querySelectorAll('#bouquetSelectionContainer input[type="checkbox"]:checked');
      const bouquetIds = Array.from(selectedCheckboxes).map(cb => cb.value);
      
      // Validation
      if (!name) {
        showNotification('Please enter a group name', 'error');
        return;
      }
      
      if (bouquetIds.length === 0) {
        showNotification('Please select at least one bouquet', 'error');
        return;
      }
      
      console.log(`💾 ${isEditing ? 'Updating' : 'Creating'} channel group:`, { 
        name, 
        description, 
        bouquet_count: bouquetIds.length,
        bouquet_ids: bouquetIds 
      });
      
      const url = isEditing ? `/api/iptv/channel-groups/${editingId}` : '/api/iptv/channel-groups';
      const method = isEditing ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name,
          description: description,
          bouquet_ids: bouquetIds
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      const result = await response.json();
      console.log(`✅ Channel group ${isEditing ? 'updated' : 'created'}:`, result);
      
      showNotification(`Channel group "${name}" ${isEditing ? 'updated' : 'created'} with ${bouquetIds.length} bouquets!`, 'success');
      
      // Hide form and refresh list
      this.hideChannelGroupForm();
      form.removeAttribute('data-editing-id');
      
      if (typeof this.loadChannelGroups === 'function') {
        await this.loadChannelGroups();
      }
      
      // Refresh dropdowns if they exist
      if (document.getElementById('defaultTrialGroup')) {
        await this.populateDefaultGroupDropdowns();
      }
      
    } catch (error) {
      console.error(`❌ Failed to ${editingId ? 'update' : 'create'} channel group:`, error);
      showNotification(`Failed to ${editingId ? 'update' : 'create'} channel group: ${error.message}`, 'error');
    }
  },

  /**
   * View all bouquets (replacement for the bouquet details view)
   */
  async viewBouquetDetails() {
    try {
      console.log('📺 Loading all bouquets for viewing...');
      
      const response = await fetch('/api/iptv/bouquets');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      const bouquets = data.bouquets || data;
      
      // Create a modal-like overlay for viewing bouquets
      const modalHTML = `
        <div id="bouquetViewModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 20px;">
          <div style="background: #1a1a1a; color: #fff; border-radius: 8px; border: 1px solid #333; max-width: 90%; max-height: 90%; overflow: hidden; display: flex; flex-direction: column;">
            <div style="padding: 20px; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center;">
              <h3 style="margin: 0; color: #4fc3f7;">All Available Bouquets</h3>
              <button onclick="document.getElementById('bouquetViewModal').remove()" style="background: #f44336; color: #fff; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer;">
                <i class="fas fa-times"></i> Close
              </button>
            </div>
            <div style="padding: 20px; overflow-y: auto; flex: 1;">
              <div id="bouquetViewContent">Loading...</div>
            </div>
          </div>
        </div>
      `;
      
      // Remove existing modal and add new one
      const existingModal = document.getElementById('bouquetViewModal');
      if (existingModal) {
        existingModal.remove();
      }
      document.body.insertAdjacentHTML('beforeend', modalHTML);
      
      // Populate with bouquet data
      const content = document.getElementById('bouquetViewContent');
      let html = '';
      
      Object.keys(bouquets).forEach(category => {
        html += `
          <div style="margin-bottom: 25px;">
            <h4 style="color: #4fc3f7; margin-bottom: 15px; border-bottom: 1px solid #333; padding-bottom: 8px;">
              ${category} (${bouquets[category].length} bouquets)
            </h4>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px;">
        `;
        
        bouquets[category].forEach(bouquet => {
          html += `
            <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 4px; border: 1px solid #333;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: #fff; font-weight: 500;">${bouquet.name}</span>
                <span style="color: #4fc3f7; font-family: monospace; font-size: 0.9rem;">ID: ${bouquet.id}</span>
              </div>
            </div>
          `;
        });
        
        html += '</div></div>';
      });
      
      content.innerHTML = html;
      
    } catch (error) {
      console.error('❌ Failed to load bouquet details:', error);
      showNotification('Failed to load bouquet details: ' + error.message, 'error');
    }
  },

  /**
   * Load and display channel groups in the settings table
   */
  async loadChannelGroups() {
    try {
      console.log('📋 Loading channel groups...');
      
      const response = await fetch('/api/iptv/channel-groups');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      const groups = data.channelGroups || data;
      console.log(`✅ Loaded ${groups.length} channel groups`);
      
      // Update the table
      const tableBody = document.getElementById('channelGroupsTableBody');
      if (tableBody) {
        this.renderChannelGroupsTable(groups, tableBody);
      }
      
      return groups;
      
    } catch (error) {
      console.error('❌ Failed to load channel groups:', error);
      showNotification('Failed to load channel groups: ' + error.message, 'error');
      
      const tableBody = document.getElementById('channelGroupsTableBody');
      if (tableBody) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #f44336;">Failed to load channel groups</td></tr>';
      }
      return [];
    }
  },

// REPLACEMENT SECTION FOR iptv.js - renderChannelGroupsTable function
// Replace the renderChannelGroupsTable function in your iptv.js with this version

/**
 * Render channel groups table (FIXED - No Star Icon)
 */
renderChannelGroupsTable(groups, tableBody) {
    if (groups.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: #666;">
                    <p>No channel groups created yet.</p>
                    <button class="btn btn-primary" onclick="IPTV.showChannelGroupForm()">
                        <i class="fas fa-plus"></i> Create Your First Group
                    </button>
                </td>
            </tr>
        `;
        return;
    }
    
    const rows = groups.map(group => {
        const bouquetIds = Array.isArray(group.bouquet_ids) ? 
            group.bouquet_ids : 
            (typeof group.bouquet_ids === 'string' ? JSON.parse(group.bouquet_ids || '[]') : []);
        
        const bouquetCount = bouquetIds.length;
        const status = group.is_active ? 
            '<span class="badge badge-success">Active</span>' : 
            '<span class="badge badge-secondary">Inactive</span>';
        
        const createdDate = new Date(group.created_at).toLocaleDateString();
        
        return `
            <tr>
                <td style="font-weight: bold; color: #4fc3f7;">${group.name}</td>
                <td>${group.description || 'No description'}</td>
                <td>
                    <span class="badge badge-info">${bouquetCount} bouquets</span>
                </td>
                <td>${status}</td>
                <td>${createdDate}</td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-info" onclick="IPTV.viewChannelGroup(${group.id})" title="View">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn btn-outline-warning" onclick="IPTV.editChannelGroup(${group.id})" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-outline-danger" onclick="IPTV.deleteChannelGroup(${group.id})" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    
    tableBody.innerHTML = rows;
}

/**
 * View specific channel group details with bouquet names
 */
async viewChannelGroup(groupId) {
  try {
    // Fetch both group data and bouquets data
    const [groupResponse, bouquetsResponse] = await Promise.all([
      fetch(`/api/iptv/channel-groups/${groupId}`),
      fetch('/api/iptv/bouquets')
    ]);
    
    if (!groupResponse.ok) {
      throw new Error(`HTTP ${groupResponse.status}`);
    }
    
    const groupData = await groupResponse.json();
    const bouquetsData = await bouquetsResponse.json();
    const group = groupData.channelGroup || groupData;
    
    // Get bouquet details for this group
    const groupBouquetIds = group.bouquet_ids || [];
    const allBouquets = bouquetsData.bouquets || {};
    
    // Find bouquets that match this group's IDs
    const groupBouquets = [];
    for (const category in allBouquets) {
      allBouquets[category].forEach(bouquet => {
        if (groupBouquetIds.includes(bouquet.id.toString())) {
          groupBouquets.push({
            ...bouquet,
            category: category
          });
        }
      });
    }
    
    // Sort bouquets by category then name
    groupBouquets.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.name.localeCompare(b.name);
    });
    
    // Create bouquets HTML
    let bouquetsHTML = '';
    if (groupBouquets.length === 0) {
      bouquetsHTML = '<div style="text-align: center; color: #666; padding: 20px;">No bouquets found in this group</div>';
    } else {
      // Group by category for display
      const categorizedBouquets = {};
      groupBouquets.forEach(bouquet => {
        if (!categorizedBouquets[bouquet.category]) {
          categorizedBouquets[bouquet.category] = [];
        }
        categorizedBouquets[bouquet.category].push(bouquet);
      });
      
      // Generate HTML by category
      for (const category in categorizedBouquets) {
        bouquetsHTML += `
          <div style="margin-bottom: 25px;">
            <h4 style="color: #4fc3f7; margin-bottom: 15px; padding-bottom: 8px; border-bottom: 1px solid #333;">
              ${category} (${categorizedBouquets[category].length} bouquets)
            </h4>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 10px;">
        `;
        
        categorizedBouquets[category].forEach(bouquet => {
          bouquetsHTML += `
            <div style="background: rgba(79, 195, 247, 0.1); padding: 12px; border-radius: 6px; border: 1px solid #4fc3f7;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: #fff; font-weight: 500;">${bouquet.name}</span>
                <span style="color: #4fc3f7; font-size: 0.9rem; font-family: monospace;">ID: ${bouquet.id}</span>
              </div>
            </div>
          `;
        });
        
        bouquetsHTML += '</div></div>';
      }
    }
    
    // Show group details in a modal
    const modalHTML = `
      <div id="groupViewModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 20px;">
        <div style="background: #1a1a1a; color: #fff; border-radius: 8px; border: 1px solid #333; max-width: 900px; width: 100%; max-height: 90%; overflow: hidden; display: flex; flex-direction: column;">
          <div style="padding: 20px; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <h3 style="margin: 0; color: #4fc3f7;">${group.name}</h3>
              <p style="margin: 5px 0 0 0; color: #ccc; font-size: 0.9rem;">${group.description || 'No description'}</p>
            </div>
            <button onclick="document.getElementById('groupViewModal').remove()" style="background: #f44336; color: #fff; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer;">
              <i class="fas fa-times"></i> Close
            </button>
          </div>
          
          <div style="padding: 20px; overflow-y: auto; flex: 1;">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 25px;">
              <div style="background: rgba(76, 175, 80, 0.1); padding: 15px; border-radius: 6px; border: 1px solid #4caf50;">
                <div style="color: #4caf50; font-size: 1.2rem; font-weight: bold;">${groupBouquets.length}</div>
                <div style="color: #fff; font-size: 0.9rem;">Total Bouquets</div>
              </div>
              <div style="background: rgba(33, 150, 243, 0.1); padding: 15px; border-radius: 6px; border: 1px solid #2196f3;">
                <div style="color: #2196f3; font-size: 1.2rem; font-weight: bold;">${Object.keys(categorizedBouquets || {}).length}</div>
                <div style="color: #fff; font-size: 0.9rem;">Categories</div>
              </div>
              <div style="background: rgba(255, 152, 0, 0.1); padding: 15px; border-radius: 6px; border: 1px solid #ff9800;">
                <div style="color: #ff9800; font-size: 1.2rem; font-weight: bold;">${group.is_active ? 'Active' : 'Inactive'}</div>
                <div style="color: #fff; font-size: 0.9rem;">Status</div>
              </div>
              <div style="background: rgba(156, 39, 176, 0.1); padding: 15px; border-radius: 6px; border: 1px solid #9c27b0;">
                <div style="color: #9c27b0; font-size: 1.2rem; font-weight: bold;">${new Date(group.created_at).toLocaleDateString()}</div>
                <div style="color: #fff; font-size: 0.9rem;">Created</div>
              </div>
            </div>
            
            <h4 style="color: #4fc3f7; margin-bottom: 15px;">Included Bouquets:</h4>
            ${bouquetsHTML}
          </div>
        </div>
      </div>
    `;
    
    // Remove existing modal and add new one
    const existingModal = document.getElementById('groupViewModal');
    if (existingModal) {
      existingModal.remove();
    }
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
  } catch (error) {
    console.error('❌ Failed to view channel group:', error);
    showNotification('Failed to load channel group details', 'error');
  }
}

  /**
   * Edit channel group
   */
  async editChannelGroup(groupId) {
    try {
      // Load the group data
      const response = await fetch(`/api/iptv/channel-groups/${groupId}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      const group = data.channelGroup || data;
      
      // Show the form with existing data
      const form = document.getElementById('channelGroupForm');
      if (form) {
        form.style.display = 'block';
        document.getElementById('channelGroupFormTitle').textContent = 'Edit Channel Group';
        
        // Fill form with existing data
        document.getElementById('channelGroupName').value = group.name;
        document.getElementById('channelGroupDescription').value = group.description || '';
        
        // Load bouquets and pre-select the ones in this group
        await this.loadBouquetsForSelection();
        
        // Pre-select bouquets
        const bouquetIds = Array.isArray(group.bouquet_ids) ? 
          group.bouquet_ids : 
          JSON.parse(group.bouquet_ids || '[]');
        
        bouquetIds.forEach(id => {
          const checkbox = document.getElementById(`bouquet_${id}`);
          if (checkbox) {
            checkbox.checked = true;
          }
        });
        
        // Store the group ID for updating
        form.setAttribute('data-editing-id', groupId);
        
        // Scroll to form
        form.scrollIntoView({ behavior: 'smooth' });
      }
      
    } catch (error) {
      console.error('❌ Failed to load channel group for editing:', error);
      showNotification('Failed to load channel group for editing', 'error');
    }
  },

  /**
   * Delete channel group
   */
  async deleteChannelGroup(groupId) {
    if (!confirm('Are you sure you want to delete this channel group?')) {
      return;
    }
    
    try {
      const response = await fetch(`/api/iptv/channel-groups/${groupId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      showNotification('Channel group deleted successfully', 'success');
      this.loadChannelGroups(); // Refresh the list
      
    } catch (error) {
      console.error('❌ Failed to delete channel group:', error);
      showNotification('Failed to delete channel group', 'error');
    }
  },

  /**
   * Set channel group as default for trial or paid users
   */
  async setAsDefault(groupId, type) {
    try {
      const settingKey = type === 'trial' ? 'iptv_default_trial_group' : 'iptv_default_paid_group';
      
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          [settingKey]: groupId.toString()
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      showNotification(`Set as default ${type} group successfully`, 'success');
      
    } catch (error) {
      console.error('❌ Failed to set default group:', error);
      showNotification('Failed to set as default group', 'error');
    }
  },

  /**
   * Load default group settings
   */
  async loadDefaultGroupSettings() {
    try {
      const response = await fetch('/api/settings');
      if (!response.ok) return;
      
      const data = await response.json();
      const settings = data.settings || data;
      
      // Find default group settings
      const trialGroupSetting = settings.find(s => s.setting_key === 'iptv_default_trial_group');
      const paidGroupSetting = settings.find(s => s.setting_key === 'iptv_default_paid_group');
      
      // Populate dropdowns
      const trialSelect = document.getElementById('defaultTrialGroup');
      const paidSelect = document.getElementById('defaultPaidGroup');
      
      if (trialSelect && trialGroupSetting) {
        trialSelect.value = trialGroupSetting.setting_value || '';
      }
      
      if (paidSelect && paidGroupSetting) {
        paidSelect.value = paidGroupSetting.setting_value || '';
      }
      
    } catch (error) {
      console.error('❌ Failed to load default group settings:', error);
    }
  },

  /**
   * Populate default group dropdowns
   */
  async populateDefaultGroupDropdowns() {
    try {
      const groups = await this.loadChannelGroups();
      
      const trialSelect = document.getElementById('defaultTrialGroup');
      const paidSelect = document.getElementById('defaultPaidGroup');
      
      if (trialSelect && paidSelect) {
        // Clear existing options (except first)
        trialSelect.innerHTML = '<option value="">None selected</option>';
        paidSelect.innerHTML = '<option value="">None selected</option>';
        
        // Add groups as options
        groups.forEach(group => {
          const option1 = new Option(group.name, group.id);
          const option2 = new Option(group.name, group.id);
          trialSelect.add(option1);
          paidSelect.add(option2);
        });
        
        // Load current settings
        await this.loadDefaultGroupSettings();
      }
    } catch (error) {
      console.error('❌ Failed to populate default group dropdowns:', error);
    }
  },

  /**
   * Save default group settings
   */
  async saveDefaultGroups() {
    try {
      const trialGroupId = document.getElementById('defaultTrialGroup').value;
      const paidGroupId = document.getElementById('defaultPaidGroup').value;
      
      const settings = {};
      if (trialGroupId) {
        settings.iptv_default_trial_group = trialGroupId;
      }
      if (paidGroupId) {
        settings.iptv_default_paid_group = paidGroupId;
      }
      
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(settings)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      showNotification('Default group settings saved successfully', 'success');
      
    } catch (error) {
      console.error('❌ Failed to save default group settings:', error);
      showNotification('Failed to save default group settings', 'error');
    }
  },

  /**
   * Load and display statistics
   */
  async loadChannelGroupStatistics() {
    try {
      // Load channel groups
      const groupsResponse = await fetch('/api/iptv/channel-groups');
      const groupsData = await groupsResponse.json();
      const groups = groupsData.channelGroups || groupsData || [];
      
      // Load bouquets
      const bouquetsResponse = await fetch('/api/iptv/bouquets');
      const bouquetsData = await bouquetsResponse.json();
      const bouquets = bouquetsData.bouquets || bouquetsData || {};
      
      // Load users with IPTV
      const usersResponse = await fetch('/api/users');
      const usersData = await usersResponse.json();
      const users = usersData.users || usersData || [];
      const iptvUsers = users.filter(user => user.iptv_username);
      
      // Calculate stats
      const totalGroups = groups.length;
      const activeGroups = groups.filter(g => g.is_active).length;
      const totalBouquets = Object.values(bouquets).reduce((total, category) => total + category.length, 0);
      const usersWithIPTV = iptvUsers.length;
      
      // Update display
      const updateStat = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
      };
      
      updateStat('totalGroupsCount', totalGroups);
      updateStat('activeGroupsCount', activeGroups);
      updateStat('totalBouquetsCount', totalBouquets);
      updateStat('usersWithIPTVCount', usersWithIPTV);
      
    } catch (error) {
      console.error('❌ Failed to load channel group statistics:', error);
    }
  },

  /**
   * Initialize channel groups section (call this when settings page loads)
   */
  async initChannelGroupsSection() {
    try {
      console.log('📋 Initializing channel groups section...');
      
      // Load channel groups
      await this.loadChannelGroups();
      
      // Populate default group dropdowns
      await this.populateDefaultGroupDropdowns();
      
      // Load statistics
      await this.loadChannelGroupStatistics();
      
      console.log('✅ Channel groups section initialized');
      
    } catch (error) {
      console.error('❌ Failed to initialize channel groups section:', error);
    }
  },

  // ===========================================
  // LEGACY MODAL FUNCTIONS (FOR COMPATIBILITY)
  // ===========================================

  /**
   * Load bouquets for the legacy modal form (keeping for compatibility)
   */
  async loadBouquetsForForm() {
    try {
      console.log('📺 Loading bouquets for modal form...');
      
      const response = await fetch('/api/iptv/bouquets');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      const bouquets = data.bouquets || data; // Handle both response formats
      
      console.log(`✅ Loaded bouquets:`, bouquets);
      
      const availableSelect = document.getElementById('availableBouquets');
      const categoryButtons = document.getElementById('categoryButtons');
      
      if (!availableSelect || !categoryButtons) {
        console.log('Legacy modal elements not found, skipping...');
        return;
      }
      
      availableSelect.innerHTML = '';
      categoryButtons.innerHTML = '';
      
      // Create category quick-select buttons
      Object.keys(bouquets).forEach(category => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-sm btn-outline-info m-1';
        button.textContent = `${category} (${bouquets[category].length})`;
        button.onclick = () => this.selectCategory(category, bouquets[category]);
        categoryButtons.appendChild(button);
      });
      
      // Populate available bouquets grouped by category
      Object.keys(bouquets).forEach(category => {
        const optgroup = document.createElement('optgroup');
        optgroup.label = `${category} (${bouquets[category].length})`;
        
        bouquets[category].forEach(bouquet => {
          const option = document.createElement('option');
          option.value = bouquet.id;
          option.textContent = bouquet.name;
          option.setAttribute('data-category', category);
          optgroup.appendChild(option);
        });
        
        availableSelect.appendChild(optgroup);
      });
      
    } catch (error) {
      console.error('❌ Failed to load bouquets:', error);
      const availableSelect = document.getElementById('availableBouquets');
      if (availableSelect) {
        availableSelect.innerHTML = '<option disabled>Failed to load bouquets</option>';
      }
    }
  },

  /**
   * Select all bouquets from a category (legacy)
   */
  selectCategory(category, bouquets) {
    const availableSelect = document.getElementById('availableBouquets');
    const selectedSelect = document.getElementById('selectedBouquets');
    
    if (!availableSelect || !selectedSelect) {
      console.log('Legacy modal elements not found');
      return;
    }
    
    bouquets.forEach(bouquet => {
      // Find and move the option
      const option = Array.from(availableSelect.options).find(opt => opt.value === bouquet.id);
      if (option) {
        selectedSelect.appendChild(option.cloneNode(true));
        option.remove();
      }
    });
    
    this.updateSelectedCount();
    showNotification(`Added all ${category} bouquets`, 'success');
  },

  /**
   * Move bouquets between lists (legacy)
   */
  moveBouquets(fromId, toId) {
    const fromSelect = document.getElementById(fromId === 'available' ? 'availableBouquets' : 'selectedBouquets');
    const toSelect = document.getElementById(toId === 'selected' ? 'selectedBouquets' : 'availableBouquets');
    
    if (!fromSelect || !toSelect) {
      console.log('Legacy modal elements not found');
      return;
    }
    
    const selectedOptions = Array.from(fromSelect.selectedOptions);
    
    selectedOptions.forEach(option => {
      toSelect.appendChild(option.cloneNode(true));
      option.remove();
    });
    
    this.updateSelectedCount();
  },

  /**
   * Move all bouquets between lists (legacy)
   */
  moveAllBouquets(fromId, toId) {
    const fromSelect = document.getElementById(fromId === 'available' ? 'availableBouquets' : 'selectedBouquets');
    const toSelect = document.getElementById(toId === 'selected' ? 'selectedBouquets' : 'availableBouquets');
    
    if (!fromSelect || !toSelect) {
      console.log('Legacy modal elements not found');
      return;
    }
    
    Array.from(fromSelect.options).forEach(option => {
      if (!option.disabled) {
        toSelect.appendChild(option.cloneNode(true));
      }
    });
    
    fromSelect.innerHTML = '';
    this.updateSelectedCount();
  },

  /**
   * Update selected count (legacy)
   */
  updateSelectedCount() {
    const selectedSelect = document.getElementById('selectedBouquets');
    const count = selectedSelect ? selectedSelect.options.length : 0;
    const countElement = document.getElementById('selectedCount');
    if (countElement) {
      countElement.textContent = count;
    }
  }
};

// Initialize when document is ready
$(document).ready(() => {
  // Initialize IPTV module if we're on a page that needs it
  if (window.location.pathname.includes('users') || window.location.pathname === '/') {
    IPTV.init();
  }
});

// Clean export for user management pages - no merging conflicts
window.IPTVUser = IPTV;

console.log('📺 IPTV user module loaded cleanly');

// Save any existing functions that might have been created by settings.js
const existingIptvFunctions = { ...window.IPTV };

// Merge this IPTV object's functions, but don't overwrite existing ones
Object.keys(IPTV).forEach(key => {
  if (typeof IPTV[key] === 'function') {
    // Only add if it doesn't exist or if the existing one is not a function
    if (!existingIptvFunctions[key] || typeof existingIptvFunctions[key] !== 'function') {
      window.IPTV[key] = IPTV[key];
    } else {
      // Keep the existing function (from settings.js) and add this one with a suffix
      window.IPTV[key + '_userForm'] = IPTV[key];
    }
  } else {
    // Non-function properties can be overwritten
    window.IPTV[key] = IPTV[key];
  }
});

// Restore any existing functions that we want to keep
Object.keys(existingIptvFunctions).forEach(key => {
  if (typeof existingIptvFunctions[key] === 'function' && !window.IPTV[key]) {
    window.IPTV[key] = existingIptvFunctions[key];
  }
});

console.log('📺 IPTV module loaded and properly merged with existing functions');
console.log('🔍 Available IPTV functions:', Object.keys(window.IPTV).filter(k => typeof window.IPTV[k] === 'function'));

// CRITICAL: Make sure the settings page functions are still available
const requiredSettingsFunctions = [
  'testPanelConnection',
  'syncPackagesFromPanel', 
  'syncBouquetsFromPanel',
  'syncCreditsBalance'
];

const missingSettingsFunctions = requiredSettingsFunctions.filter(funcName => {
  return typeof window.IPTV[funcName] !== 'function';
});

if (missingSettingsFunctions.length > 0) {
  console.warn('⚠️ Missing IPTV functions after merge:', missingSettingsFunctions);
  console.log('📋 Available functions:', Object.keys(window.IPTV).filter(k => typeof window.IPTV[k] === 'function'));
} else {
  console.log('✅ All required IPTV functions are available');
}