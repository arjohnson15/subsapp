// public/js/iptv.js - IPTV Frontend Module (COMPLETE FIXED VERSION)
const IPTV = {
  packages: {},
  channelGroups: [],
  currentUser: null,
  creditBalance: 0,
  currentLineId: null,          // Add this line
  currentUserData: null,

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
      if (window.Utils && window.Utils.showNotification) {
        window.Utils.showNotification('Failed to initialize IPTV module', 'error');
      } else if (window.showNotification) {
        window.showNotification('Failed to initialize IPTV module', 'error');
      }
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
      this.packages = { trial: [], basic: [], full: [], live_tv: [] }; // Default empty structure
      if (window.Utils && window.Utils.showNotification) {
        window.Utils.showNotification('Failed to load IPTV packages', 'error');
      }
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
        this.channelGroups = data.channelGroups || [];
        console.log('📺 Loaded channel groups:', data.total || this.channelGroups.length);
      } else {
        throw new Error(data.message);
      }
    } catch (error) {
      console.error('❌ Failed to load channel groups:', error);
      this.channelGroups = []; // Default to empty array
      if (window.Utils && window.Utils.showNotification) {
        window.Utils.showNotification('Failed to load channel groups', 'error');
      }
    }
  },

  /**
   * Load current credit balance from database (FIXED - handles both response formats)
   */
  async loadCreditBalance() {
    try {
      console.log('💳 Loading credit balance from database...');
      
      // Load from settings API (same as settings page)
      const response = await fetch('/api/settings');
      const data = await response.json();
      
      console.log('💳 Settings API response:', data);
      
      // Handle FLAT OBJECT format (your current API response)
      if (data.iptv_credits_balance !== undefined) {
        this.creditBalance = parseInt(data.iptv_credits_balance) || 0;
        console.log(`💳 Loaded credits from FLAT response: ${this.creditBalance}`);
      }
      // Handle ARRAY format (expected format)
      else if (data.success && data.settings && Array.isArray(data.settings)) {
        const creditSetting = data.settings.find(s => s.setting_key === 'iptv_credits_balance');
        if (creditSetting && creditSetting.setting_value !== undefined) {
          this.creditBalance = parseInt(creditSetting.setting_value) || 0;
          console.log(`💳 Loaded credits from ARRAY response: ${this.creditBalance}`);
        } else {
          this.creditBalance = 0;
          console.log('💳 No credit balance setting found in array, defaulting to 0');
        }
      }
      // Handle case where settings exist but no success flag
      else if (data.settings && Array.isArray(data.settings)) {
        const creditSetting = data.settings.find(s => s.setting_key === 'iptv_credits_balance');
        if (creditSetting && creditSetting.setting_value !== undefined) {
          this.creditBalance = parseInt(creditSetting.setting_value) || 0;
          console.log(`💳 Loaded credits from array (no success flag): ${this.creditBalance}`);
        } else {
          this.creditBalance = 0;
          console.log('💳 No credit balance setting found in array (no success flag), defaulting to 0');
        }
      }
      // Fallback - try to find any iptv_credits_balance property
      else {
        // Search all properties for iptv_credits_balance
        let found = false;
        for (const key in data) {
          if (key === 'iptv_credits_balance') {
            this.creditBalance = parseInt(data[key]) || 0;
            console.log(`💳 Found credits in property search: ${this.creditBalance}`);
            found = true;
            break;
          }
        }
        
        if (!found) {
          this.creditBalance = 0;
          console.log('💳 No credit balance found anywhere, defaulting to 0');
        }
      }
      
      this.updateCreditDisplay();
      
    } catch (error) {
      console.error('❌ Failed to load credit balance:', error);
      this.creditBalance = 0;
      this.updateCreditDisplay();
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

    // Credit sync button
    $(document).on('click', '#syncCreditsBtn', () => this.syncCredits());

    // Test connection button (in settings)
    $(document).on('click', '#testIPTVConnectionBtn', () => this.testConnection());
  },

/**
 * Show IPTV section when IPTV tag is checked - Updated for check existing feature
 */
showIPTVSection(userId) {
  console.log('📺 Showing IPTV section for user:', userId);
  
  this.currentUser = userId;
  
  // Show the main IPTV section
  const section = document.getElementById('iptvSection');
  if (section) {
    section.style.display = 'block';
  }
  
  // Load user's current IPTV status to determine which interface to show
  this.loadUserStatus(userId).then(() => {
    this.updateStatusInterface();
  });
  
  // Continue with other initialization
  setTimeout(() => {
    this.populatePackageSelect();
    this.populateChannelGroupSelect();
    this.updateCreditDisplay();
    this.loadDefaultChannelGroup();
    this.handleActionChange();
  }, 100);
  
  console.log('✅ IPTV section shown');
},

  /**
   * Hide IPTV section when IPTV tag is unchecked
   */
  hideIPTVSection() {
    const section = document.getElementById('iptvSection');
    if (section) {
      section.style.display = 'none';
    }
    this.currentUser = null;
    this.clearForm();
  },

/**
 * Load user's current IPTV status - Updated to track existing data
 */
async loadUserStatus(userId) {
  try {
    const response = await fetch(`/api/iptv/user/${userId}`);
    const data = await response.json();
    
    if (data.success) {
      // Store the user's IPTV status
      this.userHasExistingIPTVData = !!(
        data.user.iptv_line_id || 
        data.user.iptv_username || 
        data.user.iptv_expiration
      );
      
      this.displayUserStatus(data.user);
    } else if (response.status !== 404) {
      throw new Error(data.message);
    } else {
      // User not found in IPTV data - mark as new IPTV user
      this.userHasExistingIPTVData = false;
    }
  } catch (error) {
    console.error('❌ Failed to load user IPTV status:', error);
    this.userHasExistingIPTVData = false;
  }
},

  /**
   * Display user's current IPTV status in the Current Status section
   */
displayUserStatus(user) {
  // Store user data for filtering
  this.currentUserData = user;
  
  // CRITICAL: Store the line ID for delete functionality
  this.currentLineId = user.iptv_line_id;
  console.log('📋 Stored line ID for deletion:', this.currentLineId);
  
  const statusElements = {
    'currentLineId': user.iptv_line_id || 'None',
    'currentIptvUsername': user.iptv_username || 'None',
    'currentPackage': user.iptv_package_name || 'None',
    'currentExpiration': user.expiration_formatted || 'None',
    'currentConnections': user.iptv_connections ? `${user.active_connections || 0}/${user.iptv_connections}` : '0/0',
    'currentCreditsUsed': user.iptv_credits_used || '0'
  };
    
    Object.keys(statusElements).forEach(elementId => {
      const element = document.getElementById(elementId);
      if (element) {
        element.textContent = statusElements[elementId];
      }
    });
    
    // Update action selection based on current status
    if (user.iptv_username) {
      // User has existing subscription - default to extend
      const extendRadio = document.getElementById('iptvActionExtend');
      if (extendRadio) {
        extendRadio.checked = true;
        this.handleActionChange();
      }
    } else {
      // No subscription - default to create new
      const createRadio = document.getElementById('iptvActionCreate');
      if (createRadio) {
        createRadio.checked = true;
        this.handleActionChange();
      }
    }
  },

/**
 * Populate package selection dropdown (FIXED - excludes trial packages by default)
 */
populatePackageSelect(showTrialPackages = false) {
  const select = document.getElementById('iptvPackageSelect');
  if (!select) {
    console.warn('📦 Package select element not found - IPTV section may not be visible yet');
    return false;
  }
  
  console.log('📦 Populating package dropdown, showTrialPackages:', showTrialPackages);
  
  select.innerHTML = '<option value="">Select Package...</option>';
  
  // Check if we have package data
  if (!this.packages || Object.keys(this.packages).length === 0) {
    console.warn('📦 No package data available to populate');
    select.innerHTML = '<option value="">No packages available</option>';
    return false;
  }
  
  // FIXED: Filter package types based on trial flag
  const packageTypesToShow = showTrialPackages ? 
    ['trial', 'basic', 'full', 'live_tv'] :  // Show trial + paid when trial selected
    ['basic', 'full', 'live_tv'];            // Show only paid by default
  
  // Add package groups in order
  packageTypesToShow.forEach(type => {
    if (this.packages[type] && this.packages[type].length > 0) {
      const groupLabel = type.replace('_', ' ').toUpperCase();
      const optgroup = document.createElement('optgroup');
      optgroup.label = groupLabel;
      
      this.packages[type].forEach(pkg => {
        const option = document.createElement('option');
        option.value = pkg.package_id;
        option.dataset.type = type;
        option.textContent = `${pkg.name} (${pkg.connections} conn, ${pkg.duration_months}mo, ${pkg.credits} credits)`;
        optgroup.appendChild(option);
      });
      
      select.appendChild(optgroup);
    }
  });
  
  return true;
},

/**
 * Handle trial checkbox change
 */
handleTrialCheckboxChange(event) {
  const isTrialUser = event.target.checked;
  console.log('🔄 Trial checkbox changed:', isTrialUser);
  
  // Repopulate packages with new filter
  this.populatePackageSelect(isTrialUser);
  
  // Clear any selected package when switching
  const select = document.getElementById('iptvPackageSelect');
  if (select) select.value = '';
  
  // Hide package summary
  const summary = document.getElementById('iptvPackageSummary');
  if (summary) summary.style.display = 'none';
},

  /**
   * Populate channel group selection dropdown (FIXED - with better error handling and debugging)
   */
  populateChannelGroupSelect() {
    const select = document.getElementById('iptvChannelGroupSelect');
    if (!select) {
      console.warn('📺 Channel group select element not found - IPTV section may not be visible yet');
      return false;
    }
    
    console.log('📺 Populating channel group dropdown with data:', this.channelGroups);
    
    select.innerHTML = '<option value="">Select Channel Group...</option>';
    
    // Check if we have channel group data
    if (!this.channelGroups || this.channelGroups.length === 0) {
      console.warn('📺 No channel group data available to populate');
      select.innerHTML = '<option value="">No channel groups available</option>';
      return false;
    }
    
    this.channelGroups.forEach(group => {
      const option = document.createElement('option');
      option.value = group.id;
      option.textContent = group.name;
      select.appendChild(option);
    });
	
	this.setDefaultChannelGroup();
    
    console.log(`✅ Channel group dropdown populated with ${this.channelGroups.length} groups`);
    return true;
  },
  
 /**
 * Set default channel group based on trial state
 */
setDefaultChannelGroup() {
  const select = document.getElementById('iptvChannelGroupSelect');
  const trialCheckbox = document.getElementById('iptvTrialUser');
  
  if (!select) return;
  
  const isTrialUser = trialCheckbox ? trialCheckbox.checked : false;
  
  console.log(`📺 Setting default channel group for ${isTrialUser ? 'trial' : 'paid'} user`);
  
  // Find default channel group based on trial state
  const defaultOption = Array.from(select.options).find(option => {
    const name = option.textContent.toLowerCase();
    if (isTrialUser) {
      return name.includes('trial') || name.includes('default trial');
    } else {
      return (name.includes('default') || name.includes('basic') || name.includes('paid')) && !name.includes('trial');
    }
  });
  
  if (defaultOption) {
    select.value = defaultOption.value;
    console.log(`✅ Set default channel group: ${defaultOption.textContent}`);
  } else {
    console.log('⚠️ No default channel group found');
  }
},

  /**
   * Load default channel group based on trial/paid selection
   */
  async loadDefaultChannelGroup() {
    try {
      const isTrialUser = document.getElementById('isTrialUser') && document.getElementById('isTrialUser').checked;
      const settingKey = isTrialUser ? 'iptv_default_trial_group' : 'iptv_default_paid_group';
      
      // Load settings to get default group
      const response = await fetch('/api/settings');
      const data = await response.json();
      
      let defaultGroupId = null;
      
      // Handle both response formats
      if (data[settingKey] !== undefined) {
        defaultGroupId = data[settingKey];
      } else if (data.settings && Array.isArray(data.settings)) {
        const setting = data.settings.find(s => s.setting_key === settingKey);
        if (setting) {
          defaultGroupId = setting.setting_value;
        }
      }
      
      // Set default if found
      if (defaultGroupId) {
        const select = document.getElementById('iptvChannelGroupSelect');
        if (select) {
          select.value = defaultGroupId;
          console.log(`📺 Set default channel group: ${defaultGroupId} (${isTrialUser ? 'trial' : 'paid'})`);
        }
      }
      
    } catch (error) {
      console.error('❌ Failed to load default channel group:', error);
    }
  },

  /**
   * Handle package selection change
   */
  onPackageChange(packageId) {
    if (!packageId) {
      const summary = document.getElementById('iptvPackageSummary');
      if (summary) summary.style.display = 'none';
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
    }
  },

  /**
   * Display package summary
   */
  displayPackageSummary(pkg) {
    const summary = document.getElementById('iptvPackageSummary');
    if (!summary) return;
    
    const selectedName = document.getElementById('selectedPackageName');
    const selectedCredits = document.getElementById('selectedPackageCredits');
    
    if (selectedName) selectedName.textContent = pkg.name;
    if (selectedCredits) selectedCredits.textContent = pkg.credits;
    
    summary.style.display = 'block';
  },

  /**
   * Handle channel group selection change
   */
  onChannelGroupChange(groupId) {
    if (!groupId) return;
    
    const group = this.channelGroups.find(g => g.id == groupId);
    if (group && group.description) {
      console.log(`📺 Selected channel group: ${group.name}`);
    }
  },

  /**
   * Update credit display in the UI (enhanced version)
   */
  updateCreditDisplay() {
    const creditElements = [
      'currentCredits', 
      'currentCreditBalance', 
      '.credit-balance'
    ];
    
    creditElements.forEach(selector => {
      const element = selector.startsWith('.') ? 
        document.querySelector(selector) : 
        document.getElementById(selector);
      
      if (element) {
        element.textContent = this.creditBalance;
      }
    });
    
    console.log(`💳 Updated credit display: ${this.creditBalance}`);
  },

  /**
   * Handle action radio button changes
   */
  handleActionChange() {
    const isExtend = document.getElementById('iptvActionExtend') && document.getElementById('iptvActionExtend').checked;
    const trialGroup = document.getElementById('trialCheckboxGroup');
    const submitBtn = document.getElementById('iptvSubmitBtn');
    const submitBtnText = document.getElementById('iptvSubmitBtnText');
    
    if (isExtend) {
      // Hide trial checkbox for extend
      if (trialGroup) trialGroup.style.display = 'none';
      
      // Update button text and style
      if (submitBtnText) submitBtnText.textContent = 'Extend Subscription';
      if (submitBtn) {
        submitBtn.style.background = 'linear-gradient(45deg, #2196f3, #03a9f4)';
      }
      
      // Load paid packages only (no trial extensions)
      this.loadPackagesForExtension();
    } else {
      // Show trial checkbox for create new
      if (trialGroup) trialGroup.style.display = 'block';
      
      // Update button based on trial checkbox state
      this.handleTrialUserChange();
      
      // Load packages based on trial checkbox
      const isTrialChecked = document.getElementById('isTrialUser') && document.getElementById('isTrialUser').checked;
      this.loadPackagesForForm(isTrialChecked);
    }
  },
  
/**
   * Load packages filtered for extension (same connections only) - NEW FUNCTION
   */
  loadPackagesForExtension() {
    console.log('🔄 Loading packages for extension...');
    
    // Get current user data from the stored status
    const currentUser = this.currentUserData;
    
    if (!currentUser || !currentUser.iptv_connections) {
      console.warn('⚠️ No current user or connection info for filtering');
      // Show warning message
      const select = document.getElementById('iptvPackageSelect');
      if (select) {
        select.innerHTML = '<option value="">⚠️ User has no existing IPTV subscription to extend</option>';
      }
      return;
    }
    
    const currentConnections = parseInt(currentUser.iptv_connections);
    console.log(`🔍 Filtering packages for ${currentConnections} connections`);
    
    const select = document.getElementById('iptvPackageSelect');
    if (!select) {
      console.warn('📦 Package select element not found');
      return;
    }
    
    select.innerHTML = '<option value="">Select Extension Package...</option>';
    
    // Check if we have package data
    if (!this.packages || Object.keys(this.packages).length === 0) {
      console.warn('📦 No package data available');
      select.innerHTML = '<option value="">No packages available</option>';
      return;
    }
    
    let matchingPackagesFound = 0;
    
    // Only show paid packages (exclude trial) with matching connections
    ['basic', 'full', 'live_tv'].forEach(type => {
      if (this.packages[type] && this.packages[type].length > 0) {
        // Filter packages with matching connections
        const matchingPackages = this.packages[type].filter(pkg => 
          parseInt(pkg.connections) === currentConnections
        );
        
        if (matchingPackages.length > 0) {
          const group = document.createElement('optgroup');
          group.label = `${type === 'live_tv' ? 'Live TV Only' : 
                        type === 'full' ? 'Full Service' : 'Basic Packages'} (${currentConnections} connections)`;
          
          matchingPackages.forEach(pkg => {
            const option = document.createElement('option');
            option.value = pkg.package_id;
            option.textContent = `${pkg.name} (${pkg.connections} conn, ${pkg.duration_months}m, ${pkg.credits} credits)`;
            option.dataset.credits = pkg.credits;
            option.dataset.type = pkg.package_type;
            option.dataset.connections = pkg.connections;
            group.appendChild(option);
            matchingPackagesFound++;
          });
          
          select.appendChild(group);
        }
      }
    });
    
    if (matchingPackagesFound === 0) {
      select.innerHTML = `<option value="">❌ No packages available for ${currentConnections} connections</option>`;
      console.warn(`⚠️ No packages found with ${currentConnections} connections`);
    } else {
      console.log(`✅ Found ${matchingPackagesFound} packages with ${currentConnections} connections`);
      
      // Add helpful message
      const infoOption = document.createElement('option');
      infoOption.disabled = true;
      infoOption.textContent = `ℹ️ Showing only packages with ${currentConnections} connections (same as current)`;
      infoOption.style.fontStyle = 'italic';
      infoOption.style.color = '#4fc3f7';
      select.insertBefore(infoOption, select.children[1]);
    }
  },

  /**
   * Handle trial user checkbox changes
   */
  handleTrialUserChange() {
    const isTrialChecked = document.getElementById('isTrialUser') && document.getElementById('isTrialUser').checked;
    const submitBtnText = document.getElementById('iptvSubmitBtnText');
    const submitBtn = document.getElementById('iptvSubmitBtn');
    
    if (isTrialChecked) {
      if (submitBtnText) submitBtnText.textContent = 'Create Trial Subscription';
      if (submitBtn) {
        submitBtn.style.background = 'linear-gradient(45deg, #ff9800, #ff5722)';
      }
      // Load trial packages
      this.loadPackagesForForm(true);
    } else {
      if (submitBtnText) submitBtnText.textContent = 'Create Paid Subscription';
      if (submitBtn) {
        submitBtn.style.background = 'linear-gradient(45deg, #4caf50, #8bc34a)';
      }
      // Load paid packages
      this.loadPackagesForForm(false);
    }
    
    // Update default channel group
    this.loadDefaultChannelGroup();
  },

  /**
   * Load packages for the form based on trial/paid selection
   */
  async loadPackagesForForm(includeTrial = false) {
    const packageSelect = document.getElementById('iptvPackageSelect');
    if (!packageSelect) return;
    
    try {
      packageSelect.innerHTML = '<option value="">Loading packages...</option>';
      
      // Use the existing packages data
      packageSelect.innerHTML = '<option value="">Select a package</option>';
      
      if (includeTrial) {
        // Load trial packages
        if (this.packages.trial && this.packages.trial.length > 0) {
          this.packages.trial.forEach(pkg => {
            const option = document.createElement('option');
            option.value = pkg.package_id;
            option.textContent = `[TRIAL] ${pkg.name} (${pkg.connections} conn, ${pkg.duration_months < 1 ? Math.round(pkg.duration_months * 30 * 24) + 'h' : pkg.duration_months + 'm'}, FREE)`;
            option.dataset.credits = 0;
            option.dataset.type = 'trial';
            packageSelect.appendChild(option);
          });
        }
      } else {
        // Load paid packages - group them
        ['basic', 'full', 'live_tv'].forEach(type => {
          if (this.packages[type] && this.packages[type].length > 0) {
            const group = document.createElement('optgroup');
            group.label = type === 'live_tv' ? 'Live TV Only' : 
                        type === 'full' ? 'Full Service' : 'Basic Packages';
            
            this.packages[type].forEach(pkg => {
              const option = document.createElement('option');
              option.value = pkg.package_id;
              option.textContent = `${pkg.name} (${pkg.connections} conn, ${pkg.duration_months}m, ${pkg.credits} credits)`;
              option.dataset.credits = pkg.credits;
              option.dataset.type = pkg.package_type;
              group.appendChild(option);
            });
            
            packageSelect.appendChild(group);
          }
        });
      }
    } catch (error) {
      console.error('Error loading packages:', error);
      packageSelect.innerHTML = '<option value="">Error loading packages</option>';
    }
  },

  /**
   * Execute the selected action (single button handler)
   */
  async executeAction() {
    // Determine action based on form state
    const isExtend = document.getElementById('iptvActionExtend') && document.getElementById('iptvActionExtend').checked;
    const isTrialUser = document.getElementById('isTrialUser') && document.getElementById('isTrialUser').checked;
    
    let action;
    if (isExtend) {
      action = 'extend';
    } else if (isTrialUser) {
      action = 'create_trial';
    } else {
      action = 'create_paid';
    }
    
    console.log(`🎯 Executing action: ${action}`);
    
    // Call the unified subscription method
    await this.createSubscription(action);
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
 * Enhanced create subscription with data retrieval and status update (FIXED)
 */
async createSubscription(action) {
    let originalText = 'Submit'; // Declare at top level
    
    try {
        console.log(`🎯 Creating IPTV subscription with action: ${action}`);
        
        // Get form data
        const packageId = document.getElementById('iptvPackageSelect').value;
        const channelGroupId = document.getElementById('iptvChannelGroupSelect').value;
        const username = document.getElementById('iptvUsernameField') ? document.getElementById('iptvUsernameField').value.trim() : '';
        const password = document.getElementById('iptvPasswordField') ? document.getElementById('iptvPasswordField').value.trim() : '';
        const notes = document.getElementById('iptvNotesField') ? document.getElementById('iptvNotesField').value.trim() : '';
        
        // Get user ID - FIXED: Multiple methods to find user ID
        let userId = null;
        
        // Method 1: Try existing user ID field
        const userIdField = document.getElementById('userId');
        if (userIdField && userIdField.value) {
            userId = userIdField.value;
            console.log('📋 Found user ID from form field:', userId);
        }
        
        // Method 2: Try URL parameters
        if (!userId) {
            const urlParams = new URLSearchParams(window.location.search);
            userId = urlParams.get('id');
            if (userId) {
                console.log('📋 Found user ID from URL:', userId);
            }
        }
        
        // Method 3: Try current user from IPTV module
        if (!userId && this.currentUser) {
            userId = this.currentUser;
            console.log('📋 Found user ID from IPTV.currentUser:', userId);
        }
        
        // Method 4: Try app state
        if (!userId && window.AppState && window.AppState.editingUserId) {
            userId = window.AppState.editingUserId;
            console.log('📋 Found user ID from AppState:', userId);
        }
        
        if (!userId) {
            throw new Error('User ID not found. Please ensure you are editing a user or create a user first.');
        }
        
        if (!packageId) {
            throw new Error('Please select a package');
        }
        
        if (!channelGroupId) {
            throw new Error('Please select a channel group');
        }
        
        if (action === 'create_paid' && !username) {
			console.log('⚠️ No username provided for paid subscription - will be auto-generated by panel');
		}
        
        // Show loading state
        const submitBtn = document.getElementById('iptvSubmitBtn');
        const submitBtnText = document.getElementById('iptvSubmitBtnText');
        
        if (submitBtnText) {
            originalText = submitBtnText.textContent;
        }
        
        if (submitBtn) submitBtn.disabled = true;
        if (submitBtnText) submitBtnText.textContent = 'Processing...';
        
        // Prepare request data
        const requestData = {
            user_id: parseInt(userId),
            package_id: packageId,
            channel_group_id: parseInt(channelGroupId),
            action: action,
            username: username || undefined,
            password: password || undefined,
            notes: notes || undefined
        };
        
        console.log('📤 Sending IPTV subscription request:', requestData);
        
        // Make API request to enhanced endpoint
        const response = await fetch('/api/iptv/subscription', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.message || `HTTP ${response.status}: ${response.statusText}`);
        }
        
        if (!result.success) {
            throw new Error(result.message || 'Unknown error occurred');
        }
        
        console.log('✅ IPTV subscription created successfully:', result);
		
		// DEBUG: Log all response data
console.log('🐛 Full response data:', result.data);
console.log('🐛 IPTV Editor created:', result.data.iptv_editor_created);
console.log('🐛 IPTV Editor synced:', result.data.iptv_editor_synced); 
console.log('🐛 IPTV Editor success:', result.data.iptv_editor_success);
console.log('🐛 IPTV Editor data:', result.data.iptv_editor_data);
        
// Update the IPTV status display with enhanced data
if (result.data) {
    console.log('🔄 Updating UI with returned data:', result.data);
    
    // Update the current IPTV status section
    if (typeof this.updateIPTVStatus === 'function') {
        this.updateIPTVStatus(result.data);
    }
    
    // CRITICAL FIX: Populate form fields with retrieved data
    this.populateFormFieldsAfterCreation(result.data);
	
	// IPTV EDITOR SUCCESS HANDLING - ADD THIS SECTION
if (result.data.iptv_editor_success || result.data.iptv_editor_created || result.data.iptv_editor_synced) {
    console.log('🎯 IPTV Editor integration completed:', result.data.iptv_editor_data);
    
    // Show IPTV Editor success notification
    let editorMessage = '';
    if (result.data.iptv_editor_created) {
        editorMessage = '✅ IPTV Editor user created successfully!';
    } else if (result.data.iptv_editor_synced) {
        editorMessage = '✅ IPTV Editor user found and synced successfully!';
    }
    
    if (editorMessage) {
        if (window.Utils && window.Utils.showNotification) {
            // Show separate notification for IPTV Editor
            setTimeout(() => {
                window.Utils.showNotification(editorMessage, 'success');
            }, 1500); // Delay slightly so it shows after main message
        }
        
        // Log to console for debugging
        console.log('🎯 ' + editorMessage);
        console.log('🎯 IPTV Editor Data:', result.data.iptv_editor_data);
    }
    
    // Force reload the user data to show IPTV Editor section
    if (this.currentUser) {
// *** FIXED: Refresh user status with proper delay but NO page reload ***
setTimeout(() => {
    console.log('🔄 Refreshing IPTV status...');
    this.loadCurrentUserIPTVStatus();
    
    // *** ALSO LOAD IPTV EDITOR STATUS ***
    setTimeout(() => {
        console.log('🔄 Refreshing IPTV Editor status...');
        fetch(`/api/iptv-editor/user/${userId}/status`)
            .then(r => r.json())
            .then(data => {
                console.log('📊 IPTV Editor status loaded:', data);
                if (data.success && data.iptvUser) {
                    if (typeof loadIPTVEditorStatus === 'function') {
                        loadIPTVEditorStatus(userId);
                    } else if (typeof displayIPTVEditorStatus === 'function') {
                        displayIPTVEditorStatus(data.iptvUser);
                    }
                }
            })
            .catch(err => console.log('⚠️ IPTV Editor status load failed:', err));
    }, 500); // Load IPTV Editor status 500ms after main status
}, 2000); // Give time for notifications to show
    }
}
    
    // Update interface state
    this.userHasExistingIPTVData = true;
    this.updateStatusInterface();
    
    // Show success message with details
    let successMessage = `${action.replace('_', ' ')} successful!`;
    
    if (result.data.panel_data_retrieved) {
        successMessage += `\n✅ Panel data retrieved successfully`;
        successMessage += `\n🆔 Line ID: ${result.data.line_id}`;
        if (result.data.password) {
            successMessage += `\n🔑 Password: ${result.data.password}`;
        }
        if (result.data.days_until_expiration !== null) {
            successMessage += `\n📅 Days until expiration: ${result.data.days_until_expiration}`;
        }
        successMessage += `\n🔗 M3U URL: Available for copy`;
    } else {
        successMessage += `\n⚠️ Panel data retrieval incomplete - check manually`;
    }
    
    if (window.Utils && window.Utils.showNotification) {
        window.Utils.showNotification(successMessage, 'success');
    } else {
        alert(successMessage);
    }
    
// Refresh user status to ensure everything is current
setTimeout(() => {
    this.loadCurrentUserIPTVStatus();
    
    // *** ALSO LOAD IPTV EDITOR STATUS ***
    setTimeout(() => {
        console.log('🔄 Refreshing IPTV Editor status...');
        fetch(`/api/iptv-editor/user/${userId}/status`)
            .then(r => r.json())
            .then(data => {
                console.log('📊 IPTV Editor status loaded:', data);
                if (data.success && data.iptvUser) {
                    if (typeof loadIPTVEditorStatus === 'function') {
                        loadIPTVEditorStatus(userId);
                    } else if (typeof displayIPTVEditorStatus === 'function') {
                        displayIPTVEditorStatus(data.iptvUser);
                    }
                }
            })
            .catch(err => console.log('⚠️ IPTV Editor status load failed:', err));
    }, 500);
}, 1000);
    
} else {
    // Show success without enhanced data
    const message = result.message || `${action.replace('_', ' ')} completed successfully`;
    if (window.Utils && window.Utils.showNotification) {
        window.Utils.showNotification(message, 'success');
    } else {
        alert(message);
    }
}
        
    } catch (error) {
        console.error('❌ IPTV subscription creation failed:', error);
        
        let errorMessage = 'Failed to create IPTV subscription';
        if (error.message) {
            errorMessage += `\n${error.message}`;
        }
        
        if (window.Utils && window.Utils.showNotification) {
            window.Utils.showNotification(errorMessage, 'error');
        } else {
            alert(errorMessage);
        }
    } finally {
        // Restore button state - FIXED: originalText is now in scope
        const submitBtn = document.getElementById('iptvSubmitBtn');
        const submitBtnText = document.getElementById('iptvSubmitBtnText');
        
        if (submitBtn) submitBtn.disabled = false;
        if (submitBtnText) submitBtnText.textContent = originalText;
    }
},

  /**
   * Reset IPTV form to default state (NEW METHOD)
   */
  resetIPTVForm() {
    // Reset package selection
    const packageSelect = document.getElementById('iptvPackageSelect');
    if (packageSelect) {
        packageSelect.selectedIndex = 0;
    }
    
    // Reset channel group selection
    const channelGroupSelect = document.getElementById('iptvChannelGroupSelect');
    if (channelGroupSelect) {
        channelGroupSelect.selectedIndex = 0;
    }
    
    // Don't clear username/password as they might be auto-generated and needed
    // Clear notes
    const notesField = document.getElementById('iptvNotesField');
    if (notesField) {
        notesField.value = '';
    }
    
    // Reset action to default (create_paid)
    const createPaidRadio = document.getElementById('iptvActionCreate');
    const trialCheckbox = document.getElementById('isTrialUser');
    
    if (createPaidRadio) createPaidRadio.checked = true;
    if (trialCheckbox) trialCheckbox.checked = false;
    
    // Refresh button text
    if (this.updateSubmitButtonText) {
        this.updateSubmitButtonText();
    }
  },
  
/**
 * Update IPTV status display - ENHANCED WITH DAYS CALCULATION AND M3U URL
 */
updateIPTVStatus(data) {
    console.log('📺 Updating IPTV status display:', data);
    
    // Update Line ID
    const lineIdElement = document.getElementById('iptvLineId');
    if (lineIdElement) {
        lineIdElement.textContent = data.iptv_line_id || 'None';
    }

    // Update Connections  
    const connectionsElement = document.getElementById('iptvConnections');
    if (connectionsElement) {
        const current = data.active_connections || 0;
        const max = data.iptv_connections || 0;
        connectionsElement.textContent = max > 0 ? `${current}/${max}` : '0/0';
    }
    
    // Calculate and Update Days Until Expiration
    const daysLeftElement = document.getElementById('iptvDaysLeft');
    if (daysLeftElement) {
        if (data.iptv_expiration) {
            const now = new Date();
            const expiration = new Date(data.iptv_expiration);
            
            // Calculate days difference
            const timeDiff = expiration.getTime() - now.getTime();
            const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
            
            if (daysDiff > 0) {
                daysLeftElement.textContent = `${daysDiff} days`;
                daysLeftElement.style.color = daysDiff > 7 ? '#4caf50' : '#ff9800';
            } else if (daysDiff === 0) {
                daysLeftElement.textContent = 'Expires today';
                daysLeftElement.style.color = '#ff9800';
            } else {
                daysLeftElement.textContent = 'Expired';
                daysLeftElement.style.color = '#f44336';
            }
            
            console.log(`📅 Calculated days until expiration: ${daysDiff}`);
        } else {
            daysLeftElement.textContent = 'None';
            daysLeftElement.style.color = '#fff';
        }
    }
    
const expirationElement = document.getElementById('iptvExpiration');
if (expirationElement) {
    if (data.iptv_expiration) {
        // FIXED: Parse date as local timezone to avoid UTC shift
        let dateString = data.iptv_expiration;
        
        // Extract just the date part if it's a datetime string
        if (dateString.includes('T')) {
            dateString = dateString.split('T')[0];
        } else if (dateString.includes(' ')) {
            dateString = dateString.split(' ')[0];
        }
        
        // Parse as local date to avoid timezone shift
        const [year, month, day] = dateString.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        
        expirationElement.textContent = date.toLocaleDateString();
        
        console.log(`📅 Frontend display: ${data.iptv_expiration} → ${dateString} → ${date.toLocaleDateString()}`);
    } else {
        expirationElement.textContent = 'None';
    }
}
    
// Update M3U URL - Enhanced with multiple field checks and better data source detection
const m3uUrl = data.iptv_m3u_url || data.m3u_url || data.m3u_plus_url;

console.log('🔗 Checking for M3U URL in data...', {
    iptv_m3u_url: data.iptv_m3u_url,
    m3u_url: data.m3u_url, 
    m3u_plus_url: data.m3u_plus_url,
    final_url: m3uUrl
});

if (m3uUrl) {
    console.log('🔗 Found M3U URL:', m3uUrl);
    
    // Try multiple possible M3U field IDs
    const m3uFields = ['iptvM3UUrl', 'iptv_m3u_url', 'm3uUrl', 'iptvM3ULink'];
    let fieldSet = false;
    
    for (const fieldId of m3uFields) {
        const m3uElement = document.getElementById(fieldId);
        if (m3uElement) {
            m3uElement.value = m3uUrl;
            console.log(`✅ Set M3U field ${fieldId}`);
            fieldSet = true;
            break;
        }
    }
    
    if (!fieldSet) {
        console.warn('⚠️ No M3U URL field found to populate');
    }
    
    // Show M3U section if it exists
    const m3uSection = document.getElementById('iptvM3USection');
    if (m3uSection) {
        m3uSection.style.display = 'block';
        console.log('✅ Showed M3U section');
    } else {
        console.warn('⚠️ M3U section element not found');
    }
} else {
    console.log('⚠️ No M3U URL found in data - available fields:', Object.keys(data).filter(key => key.toLowerCase().includes('m3u')));
    const m3uSection = document.getElementById('iptvM3USection');
    if (m3uSection) {
        m3uSection.style.display = 'none';
    }
}
    
    // Update Status Indicator
    const statusDot = document.getElementById('iptvStatusDot');
    const statusText = document.getElementById('iptvStatusText');
    const trialIndicator = document.getElementById('iptvTrialIndicator');
    
    if (statusDot && statusText) {
        if (data.enabled === false) {
            statusDot.style.background = '#f44336';
            statusText.textContent = 'Disabled';
        } else if (data.iptv_line_id || data.line_id) {
            const now = new Date();
            const expiration = data.iptv_expiration ? new Date(data.iptv_expiration) : null;
            
            if (expiration && expiration < now) {
                statusDot.style.background = '#f44336';
                statusText.textContent = 'Expired';
            } else {
                statusDot.style.background = '#4caf50';
                statusText.textContent = 'Active';
            }
        } else {
            statusDot.style.background = '#f44336';
            statusText.textContent = 'Inactive';
        }
    }
    
    // Show/hide trial indicator
    if (trialIndicator) {
        if (data.iptv_is_trial || data.is_trial) {
            trialIndicator.style.display = 'flex';
        } else {
            trialIndicator.style.display = 'none';
        }
    }
},

/**
 * Populate form fields after successful subscription creation
 */
populateFormFieldsAfterCreation(data) {
    console.log('📝 Populating form fields after subscription creation:', data);
    
    // Update username fields - try multiple possible field IDs
    if (data.username || data.iptv_username) {
        const username = data.username || data.iptv_username;
        const usernameFields = [
            'iptvUsernameField',    // IPTV management section
            'iptvUsername',         // Basic info section  
            'iptv_username'         // Alternative field
        ];
        
        for (const fieldId of usernameFields) {
            const field = document.getElementById(fieldId);
            if (field) {
                field.value = username;
                console.log(`✅ Set username field ${fieldId}: ${username}`);
            }
        }
    }
    
    // Update password fields - try multiple possible field IDs
    if (data.password || data.iptv_password) {
        const password = data.password || data.iptv_password;
        const passwordFields = [
            'iptvPasswordField',    // IPTV management section
            'iptvPassword',         // Basic info section
            'iptv_password'         // Alternative field
        ];
        
        for (const fieldId of passwordFields) {
            const field = document.getElementById(fieldId);
            if (field) {
                field.value = password;
                console.log(`✅ Set password field ${fieldId}: ${password}`);
            }
        }
    }
    
    // Update M3U URL field
    const m3uUrl = data.m3u_plus_url || data.iptv_m3u_url || data.m3u_url;
    if (m3uUrl) {
        const m3uFields = ['iptvM3UUrl', 'iptv_m3u_url', 'm3uUrl'];
        for (const fieldId of m3uFields) {
            const field = document.getElementById(fieldId);
            if (field) {
                field.value = m3uUrl;
                console.log(`✅ Set M3U URL field ${fieldId}`);
                break;
            }
        }
    }
},

/**
 * Populate basic user info fields with IPTV data - NEW METHOD
 */
populateBasicUserFields(userData) {
    console.log('📋 Populating basic user fields with IPTV data:', userData);
    
    // Populate IPTV username in basic info section
    if (userData.iptv_username) {
        const iptvUsernameField = document.getElementById('iptvUsername');
        if (iptvUsernameField) {
            iptvUsernameField.value = userData.iptv_username;
            console.log('✅ Set basic IPTV username field');
        }
    }
    
    // Populate IPTV password in basic info section  
    if (userData.iptv_password) {
        const iptvPasswordField = document.getElementById('iptvPassword');
        if (iptvPasswordField) {
            iptvPasswordField.value = userData.iptv_password;
            console.log('✅ Set basic IPTV password field');
        }
    }
    
    // Populate iMPlayer code if available
    if (userData.implayer_code) {
        const implayerField = document.getElementById('implayerCode');
        if (implayerField) {
            implayerField.value = userData.implayer_code;
            console.log('✅ Set iMPlayer code field');
        }
    }
    
    // Populate device count
    if (userData.device_count) {
        const deviceCountField = document.getElementById('deviceCount');
        if (deviceCountField) {
            deviceCountField.value = userData.device_count;
            console.log('✅ Set device count field');
        }
    }
},

/**
 * Load IPTV status for current user - ENHANCED VERSION WITH BETTER FIELD POPULATION
 */
async loadCurrentUserIPTVStatus() {
    try {
        const userId = this.getCurrentUserId();
        
        if (!userId) {
            console.warn('⚠️ No user ID found for IPTV status loading');
            return;
        }
        
        console.log('📊 Loading IPTV status for user:', userId);
        
        const response = await fetch(`/api/iptv/user/${userId}`);
        const result = await response.json();
        
        if (result.success && result.user) {
            this.updateIPTVStatus(result.user);
            
            // Update ALL possible username fields
            if (result.user.iptv_username) {
                const usernameFields = [
                    'iptvUsername',      // Basic info section
                    'iptv_username', 
                    'iptvUsernameField'  // IPTV management section
                ];
                for (const fieldId of usernameFields) {
                    const field = document.getElementById(fieldId);
                    if (field) {
                        field.value = result.user.iptv_username;
                        console.log(`✅ Set username field ${fieldId}: ${result.user.iptv_username}`);
                    }
                }
            }

            // Update ALL possible password fields - ENHANCED VERSION  
            let passwordValue = null;

            // Try multiple sources for password
            if (result.user.iptv_password) {
                passwordValue = result.user.iptv_password;
                console.log('🔑 Found password in user.iptv_password:', passwordValue);
            } else if (result.user.panel_data && result.user.panel_data.password) {
                passwordValue = result.user.panel_data.password;
                console.log('🔑 Found password in user.panel_data.password:', passwordValue);
            } else {
                console.log('🔑 No password found in user data');
            }

            if (passwordValue) {
                const passwordFields = [
                    'iptvPassword',      // Basic info section  
                    'iptv_password',
                    'iptvPasswordField'  // IPTV management section
                ];
                for (const fieldId of passwordFields) {
                    const field = document.getElementById(fieldId);
                    if (field) {
                        field.value = passwordValue;
                        console.log(`✅ Set password field ${fieldId}: ${passwordValue}`);
                    }
                }
            } else {
                console.warn('⚠️ No password value found to populate');
            }

// Update IPTV Expiration field in subscription section - FIXED: NO CONVERSION  
if (result.user.iptv_expiration) {
    const iptvExpirationFields = [
        'iptvExpiration',        // Basic subscription field
        'iptv_expiration'        // Alternative field name
    ];
    
    // FIXED: Use date as-is from database, no timezone conversion
    let dateValue = result.user.iptv_expiration;
    
    // Only extract date part if it's a full datetime string
    if (typeof dateValue === 'string') {
        if (dateValue.includes('T')) {
            dateValue = dateValue.split('T')[0];
        } else if (dateValue.includes(' ')) {
            dateValue = dateValue.split(' ')[0];  
        }
    }
    
    console.log(`📅 Using IPTV expiration as-is (no conversion): ${result.user.iptv_expiration} → ${dateValue}`);
    
    if (dateValue) {
        for (const fieldId of iptvExpirationFields) {
            const field = document.getElementById(fieldId);
            if (field) {
                field.value = dateValue;
                console.log(`✅ Set IPTV expiration field ${fieldId}: ${dateValue}`);
            }
        }
    }
} else {
    console.log('📅 No IPTV expiration date found to populate');
}
            
            // Update interface state
            this.userHasExistingIPTVData = !!(result.user.iptv_username || result.user.iptv_line_id);
            
            // Show appropriate interface
            const checkInterface = document.getElementById('checkExistingInterface');
            const statusDisplay = document.getElementById('iptvStatusDisplay');
            
            if (this.userHasExistingIPTVData) {
                if (checkInterface) checkInterface.style.display = 'none';
                if (statusDisplay) statusDisplay.style.display = 'block';
            } else {
                if (checkInterface) checkInterface.style.display = 'block';
                if (statusDisplay) statusDisplay.style.display = 'none';
            }
            
        } else {
            console.log('📋 No existing IPTV data for user');
            this.updateIPTVStatus({
                line_id: null, max_connections: 0, current_connections: 0,
                days_until_expiration: null, expiration_date: null,
                m3u_plus_url: null, enabled: false, is_trial: false
            });
            
            // Show check interface for new user
            const checkInterface = document.getElementById('checkExistingInterface');
            const statusDisplay = document.getElementById('iptvStatusDisplay');
            if (checkInterface) checkInterface.style.display = 'block';
            if (statusDisplay) statusDisplay.style.display = 'none';
        }
        
    } catch (error) {
        console.error('❌ Failed to load user IPTV status:', error);
    }
},

  /**
   * Sync credit balance from panel (matching settings page approach)
   */
  async syncCredits() {
    // Find the sync button using the existing onclick pattern in your HTML
    const button = document.querySelector('button[onclick*="IPTV.syncCredits"]');
    
    if (!button) {
      console.error('❌ Sync credits button not found');
      return;
    }
    
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    button.disabled = true;
    
    try {
      console.log('💳 Syncing credit balance from panel...');
      
      // Use the same API endpoint as settings page
      const response = await fetch('/api/iptv/sync-credits', { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        const credits = data.credits || 0;
        
        // Update local balance
        this.creditBalance = credits;
        
        // Update the display immediately
        this.updateCreditDisplay();
        
        // Show success notification
        if (window.Utils && window.Utils.showNotification) {
          window.Utils.showNotification(`Credit balance synced: ${credits} credits`, 'success');
        } else if (window.showNotification) {
          window.showNotification(`Credit balance synced: ${credits} credits`, 'success');
        } else {
          console.log(`✅ Credit balance synced: ${credits} credits`);
        }
        
        console.log(`✅ Credit balance synced successfully: ${credits} credits`);
      } else {
        throw new Error(data.message || 'Sync failed');
      }
    } catch (error) {
      console.error('❌ Failed to sync credits:', error);
      
      // Show error notification
      if (window.Utils && window.Utils.showNotification) {
        window.Utils.showNotification(`Failed to sync credits: ${error.message}`, 'error');
      } else if (window.showNotification) {
        window.showNotification(`Failed to sync credits: ${error.message}`, 'error');
      }
    } finally {
      // Restore button state
      button.innerHTML = originalText;
      button.disabled = false;
    }
  },
  
  /**
   * Delete IPTV subscription from panel and database
   */
  async deleteSubscription() {
    try {
      // Get current user ID and line ID
      const userId = this.currentUser;
      if (!userId) {
        throw new Error('No user selected. Please ensure you are editing a user.');
      }
      
// Get line ID from stored user data
      let lineId = this.currentLineId;

      // Fallback: try to get from current user data  
      if (!lineId && this.currentUserData && this.currentUserData.iptv_line_id) {
        lineId = this.currentUserData.iptv_line_id;
      }

      // Final fallback: try DOM element
      if (!lineId) {
        const lineIdElement = document.getElementById('currentLineId');
        lineId = lineIdElement ? lineIdElement.textContent.trim() : null;
      }

      console.log('🗑️ Using line ID for deletion:', lineId);

      if (!lineId || lineId === 'None' || lineId === '') {
        throw new Error('No active IPTV subscription found to delete.');
      }
      
      console.log(`🗑️ Attempting to delete subscription for user ${userId}, line ${lineId}`);
      
      // Show confirmation dialog
      const confirmMessage = `⚠️ WARNING: This will permanently delete the IPTV subscription!\n\n` +
                            `Line ID: ${lineId}\n` +
                            `This action cannot be undone.\n\n` +
                            `Are you sure you want to proceed?`;
      
      if (!confirm(confirmMessage)) {
        console.log('❌ User cancelled deletion');
        return;
      }
      
      // Show loading state
      const deleteBtn = document.getElementById('iptvDeleteBtn');
      if (deleteBtn) {
        deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
        deleteBtn.disabled = true;
      }
      
      console.log(`📤 Sending delete request for line ${lineId}`);
      
      // Make delete request to the panel + database endpoint
      const response = await fetch(`/api/iptv/subscription/${lineId}?userId=${userId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || `HTTP ${response.status}: ${response.statusText}`);
      }
      
      if (result.success) {
        console.log('✅ Subscription deleted successfully:', result);
        
        // Show success message
        const successMessage = `✅ Subscription deleted successfully!\n\n` +
                              `Line ${lineId} has been removed from the panel` +
                              (result.databaseCleared ? ' and database.' : '.');
        
        if (window.Utils && window.Utils.showNotification) {
          window.Utils.showNotification(successMessage, 'success');
        } else {
          alert(successMessage);
        }
        
        // Clear the IPTV status display and reset to check interface
        this.userHasExistingIPTVData = false;
        this.updateStatusInterface();
        
        // Clear status display
        const statusDisplay = document.getElementById('iptvStatusDisplay');
        const checkInterface = document.getElementById('checkExistingInterface');
        
        if (statusDisplay) statusDisplay.style.display = 'none';
        if (checkInterface) checkInterface.style.display = 'block';
        
        // Reset form state
        this.resetIPTVForm();
        
        console.log('🔄 Status interface updated after deletion');
        
      } else {
        throw new Error(result.message || 'Delete request failed');
      }
      
    } catch (error) {
      console.error('❌ Failed to delete IPTV subscription:', error);
      
      let errorMessage = '❌ Failed to delete IPTV subscription\n\n';
      if (error.message.includes('No active IPTV subscription')) {
        errorMessage += 'No active subscription found to delete.';
      } else if (error.message.includes('No user selected')) {
        errorMessage += 'Please ensure you are editing a user first.';
      } else {
        errorMessage += error.message;
      }
      
      if (window.Utils && window.Utils.showNotification) {
        window.Utils.showNotification(errorMessage, 'error');
      } else {
        alert(errorMessage);
      }
      
    } finally {
      // Restore button state
      const deleteBtn = document.getElementById('iptvDeleteBtn');
      if (deleteBtn) {
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i> Delete Subscription';
        deleteBtn.disabled = false;
      }
    }
  },

  /**
   * Clear form fields
   */
  clearForm() {
    const elements = [
      'iptvPackageSelect',
      'iptvChannelGroupSelect', 
      'iptvUsernameField',
      'iptvPasswordField',
      'iptvNotesField'
    ];
    
    elements.forEach(id => {
      const element = document.getElementById(id);
      if (element) element.value = '';
    });
    
    const summary = document.getElementById('iptvPackageSummary');
    if (summary) summary.style.display = 'none';
  },

  /**
   * Test IPTV panel connection
   */
  async testConnection() {
    const button = document.getElementById('testIPTVConnectionBtn');
    if (!button) return;
    
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';
    button.disabled = true;
    
    try {
      const response = await fetch('/api/iptv/test-connection', { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        if (window.Utils && window.Utils.showNotification) {
          window.Utils.showNotification(data.message, 'success');
        } else if (window.showNotification) {
          window.showNotification(data.message, 'success');
        }
      } else {
        if (window.Utils && window.Utils.showNotification) {
          window.Utils.showNotification(data.message, 'error');
        } else if (window.showNotification) {
          window.showNotification(data.message, 'error');
        }
      }
      
    } catch (error) {
      console.error('❌ Connection test failed:', error);
      if (window.Utils && window.Utils.showNotification) {
        window.Utils.showNotification('Connection test failed', 'error');
      } else if (window.showNotification) {
        window.showNotification('Connection test failed', 'error');
      }
    } finally {
      button.innerHTML = originalText;
      button.disabled = false;
    }
  },

  /**
   * Sync user status from panel
   */
  async syncUserStatus() {
    if (!this.currentUser) return;
    
    const button = document.getElementById('iptvSyncBtn');
    if (!button) return;
    
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    button.disabled = true;
    
    try {
      const response = await fetch(`/api/iptv/sync-user/${this.currentUser}`);
      const data = await response.json();
      
      if (data.success) {
        if (window.Utils && window.Utils.showNotification) {
          window.Utils.showNotification('User status synced successfully', 'success');
        } else if (window.showNotification) {
          window.showNotification('User status synced successfully', 'success');
        }
        await this.loadUserStatus(this.currentUser);
      } else {
        throw new Error(data.message);
      }
      
    } catch (error) {
      console.error('❌ Failed to sync user status:', error);
      if (window.Utils && window.Utils.showNotification) {
        window.Utils.showNotification(`Failed to sync user status: ${error.message}`, 'error');
      } else if (window.showNotification) {
        window.showNotification(`Failed to sync user status: ${error.message}`, 'error');
      }
    } finally {
      button.innerHTML = originalText;
      button.disabled = false;
    }
  },

  /**
   * Clear selection and reset form
   */
  clearSelection() {
    this.clearForm();
    
    if (window.Utils && window.Utils.showNotification) {
      window.Utils.showNotification('Selection cleared', 'info');
    } else if (window.showNotification) {
      window.showNotification('Selection cleared', 'info');
    }
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
   * Get current user ID using multiple methods - ENHANCED VERSION
   */
  getCurrentUserId() {
    let userId = null;
    
    // Method 1: Form field (try multiple possible IDs)
    const possibleUserIdFields = ['userId', 'user_id', 'editUserId'];
    for (const fieldId of possibleUserIdFields) {
      const field = document.getElementById(fieldId);
      if (field && field.value) {
        userId = field.value;
        console.log(`📋 Found user ID from field ${fieldId}:`, userId);
        break;
      }
    }
    
    // Method 2: URL parameters
    if (!userId) {
      const urlParams = new URLSearchParams(window.location.search);
      userId = urlParams.get('id');
      if (userId) {
        console.log('📋 Found user ID from URL:', userId);
      }
    }
    
    // Method 3: IPTV module state
    if (!userId && this.currentUser) {
      userId = this.currentUser;
      console.log('📋 Found user ID from IPTV.currentUser:', userId);
    }
    
    // Method 4: App state
    if (!userId && window.AppState && window.AppState.editingUserId) {
      userId = window.AppState.editingUserId;
      console.log('📋 Found user ID from AppState:', userId);
    }
    
    // Method 5: Try to extract from current page context
    if (!userId) {
      const userFormTitle = document.querySelector('h2');
      if (userFormTitle && userFormTitle.textContent.includes('Edit User')) {
        // Try to extract from URL if we're on edit page
        const pathParts = window.location.pathname.split('/');
        const idIndex = pathParts.indexOf('edit');
        if (idIndex !== -1 && pathParts[idIndex + 1]) {
          userId = pathParts[idIndex + 1];
          console.log('📋 Found user ID from URL path:', userId);
        }
      }
    }
    
    if (userId) {
      // Store for future use
      this.currentUser = userId;
      console.log('✅ Using user ID:', userId);
    } else {
      console.warn('⚠️ No user ID found using any method');
    }
    
    return userId;
  },

/**
 * Update the status interface based on user's current IPTV data
 */
updateStatusInterface() {
    const statusDisplay = document.getElementById('iptvStatusDisplay');
    const checkExistingInterface = document.getElementById('checkExistingInterface');
    
    console.log('🔄 Updating status interface, userHasExistingIPTVData:', this.userHasExistingIPTVData);
    
    if (this.userHasExistingIPTVData) {
        // User has IPTV data - show normal status display
        if (statusDisplay) {
            statusDisplay.style.display = 'block';
            console.log('✅ Showing IPTV status display');
        }
        if (checkExistingInterface) {
            checkExistingInterface.style.display = 'none';
            console.log('✅ Hiding check existing interface');
        }
    } else {
        // User has no IPTV data - show check existing interface
        if (statusDisplay) {
            statusDisplay.style.display = 'none';
            console.log('✅ Hiding IPTV status display');
        }
        if (checkExistingInterface) {
            checkExistingInterface.style.display = 'block';
            console.log('✅ Showing check existing interface');
            this.initializeCheckExistingInterface();
        }
    }
},

  /**
   * Initialize the check existing interface
   */
  initializeCheckExistingInterface() {
    const usernameInput = document.getElementById('existingIptvUsername');
    const checkBtn = document.getElementById('checkAccessBtn');
    
    if (usernameInput && checkBtn) {
      // Remove existing listeners to prevent duplicates
      usernameInput.removeEventListener('input', this.handleUsernameInput);
      checkBtn.removeEventListener('click', this.handleCheckAccess);
      
      // Add input event listener
      this.handleUsernameInput = () => {
        const username = usernameInput.value.trim();
        checkBtn.disabled = username.length === 0;
      };
      
      this.handleCheckAccess = () => {
        this.checkExistingAccess();
      };
      
      usernameInput.addEventListener('input', this.handleUsernameInput);
      checkBtn.addEventListener('click', this.handleCheckAccess);
    }
  },

  /**
   * Check for existing IPTV access
   */
  async checkExistingAccess() {
    const usernameInput = document.getElementById('existingIptvUsername');
    const checkBtn = document.getElementById('checkAccessBtn');
    const resultsDiv = document.getElementById('accessCheckResults');
    
    if (!usernameInput || !checkBtn || !resultsDiv) return;
    
    const username = usernameInput.value.trim();
    
    if (!username) {
      this.showAccessCheckError('Please enter an IPTV username');
      return;
    }
    
    // Show loading state
    const originalBtnContent = checkBtn.innerHTML;
    checkBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Searching...';
    checkBtn.disabled = true;
    usernameInput.disabled = true;
    
    try {
      console.log(`🔍 Checking for existing IPTV access: ${username}`);
      
      // Get current user ID
      const userId = this.getCurrentUserId();
      if (!userId) {
        throw new Error('User ID not found');
      }
      
      // Make API call
      const response = await fetch('/api/iptv/match-existing-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: parseInt(userId),
          iptv_username: username
        })
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || `HTTP ${response.status}`);
      }
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to find user');
      }
      
      // Show success results
      this.showAccessCheckSuccess(result.iptv_data);
      
    } catch (error) {
      console.error('❌ Error checking existing access:', error);
      this.showAccessCheckError(error.message);
    } finally {
      // Restore button state
      checkBtn.innerHTML = originalBtnContent;
      checkBtn.disabled = false;
      usernameInput.disabled = false;
    }
  },

/**
 * Show successful access check results - FIXED VERSION
 */
showAccessCheckSuccess(iptvData) {
  const resultsDiv = document.getElementById('accessCheckResults');
  if (!resultsDiv) return;
  
  resultsDiv.className = 'access-results success';
  resultsDiv.style.display = 'block';
  
  resultsDiv.innerHTML = `
    <div class="success-message">
      <i class="fas fa-check-circle" style="color: #28a745; margin-right: 8px;"></i>
      <strong>IPTV Account Found!</strong>
    </div>
    
    <div class="found-user-info">
      <div class="info-item">
        <span class="label">Username:</span>
        <span class="value">${iptvData.username}</span>
      </div>
      <div class="info-item">
        <span class="label">Line ID:</span>
        <span class="value">${iptvData.line_id}</span>
      </div>
      <div class="info-item">
        <span class="label">Expiration:</span>
        <span class="value">${iptvData.expiration_formatted}</span>
      </div>
      <div class="info-item">
        <span class="label">Connections:</span>
        <span class="value">${iptvData.connections} max</span>
      </div>
      <div class="info-item">
        <span class="label">Status:</span>
        <span class="value">${iptvData.enabled ? 'Active' : 'Inactive'}</span>
      </div>
      <div class="info-item">
        <span class="label">Account Type:</span>
        <span class="value">${iptvData.is_trial ? 'Trial' : 'Paid'}</span>
      </div>
    </div>
    
    <button type="button" class="btn link-account-btn" 
            style="background: linear-gradient(45deg, #28a745, #34ce57); color: #fff; border: none; padding: 10px; border-radius: 4px; font-weight: bold; width: 100%; margin-top: 15px;"
            onclick="window.IPTV.linkExistingAccount()">
      <i class="fas fa-link"></i> Account Successfully Linked
    </button>
  `;
  
  // Store the data for potential linking
  this.foundIPTVData = iptvData;
  
  // Show notification
  if (window.Utils && window.Utils.showNotification) {
    window.Utils.showNotification(
      `Successfully found and linked IPTV account: ${iptvData.username}`, 
      'success'
    );
  }
  this.userHasExistingIPTVData = true;

},

  /**
   * Show error message for access check
   */
  showAccessCheckError(message) {
    const resultsDiv = document.getElementById('accessCheckResults');
    if (!resultsDiv) return;
    
    resultsDiv.className = 'access-results error';
    resultsDiv.style.display = 'block';
    
    resultsDiv.innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-triangle" style="color: #dc3545; margin-right: 8px;"></i>
        <strong>No Account Found</strong>
      </div>
      <p style="margin: 10px 0 0 0; color: #b0b0b0;">
        ${message}
      </p>
      <p style="margin: 10px 0 0 0; color: #888; font-size: 12px;">
        If the user needs a new IPTV account, use the "Create New Subscription" options below.
      </p>
    `;
    
    // Show notification
    if (window.Utils && window.Utils.showNotification) {
      window.Utils.showNotification(message, 'error');
    }
  },

linkExistingAccount() {
  try {
    console.log('🔗 Linking existing IPTV account...');
    
    if (!this.foundIPTVData) {
      console.error('❌ No IPTV data found to link');
      return;
    }
    
    // Get current user ID
    const userId = this.getCurrentUserId();
    if (!userId) {
      console.error('❌ No user ID found');
      return;
    }
    
    // Show loading state
    const linkBtn = document.querySelector('.link-account-btn');
    if (linkBtn) {
      linkBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Linking Account...';
      linkBtn.disabled = true;
    }
    
    // Save to database
    this.saveLinkedAccount(userId, this.foundIPTVData);
    
  } catch (error) {
    console.error('❌ Error in linkExistingAccount:', error);
  }
},

async saveLinkedAccount(userId, iptvData) {
  try {
    console.log('💾 Saving linked IPTV account to database...');
    
    const response = await fetch('/api/iptv/link-existing-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: parseInt(userId),
        iptv_data: iptvData
      })
    });
    
    const result = await response.json();
    
    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to save linked account');
    }
    
    console.log('✅ Account linked and saved successfully');
    
    // Update interface state
    this.userHasExistingIPTVData = true;
    this.foundIPTVData = null;
    
    // FIXED: Reset the access check interface properly
    const accessCheckResults = document.getElementById('accessCheckResults');
    const existingUsernameInput = document.getElementById('existingIptvUsername');
    const checkBtn = document.getElementById('checkAccessBtn');
    
    // Hide the results and reset the form
    if (accessCheckResults) {
      accessCheckResults.style.display = 'none';
      accessCheckResults.innerHTML = '';
    }
    
    // Clear the username input
    if (existingUsernameInput) {
      existingUsernameInput.value = '';
    }
    
    // Reset the check button
    if (checkBtn) {
      checkBtn.disabled = true; // Will be re-enabled when user types
      checkBtn.innerHTML = '<i class="fas fa-search"></i> Check';
    }
    
    // Update status display - but keep the simple check interface visible for future use
    const statusDisplay = document.getElementById('iptvStatusDisplay');
    if (statusDisplay) {
      statusDisplay.style.display = 'block';
    }
    
    // Show success notification - with better error handling
    try {
      if (window.Utils && typeof window.Utils.showNotification === 'function') {
        window.Utils.showNotification('IPTV account linked successfully!', 'success');
      } else if (window.showNotification && typeof window.showNotification === 'function') {
        window.showNotification('IPTV account linked successfully!', 'success');
      } else {
        console.log('✅ IPTV account linked successfully!');
      }
    } catch (notificationError) {
      console.warn('⚠️ Could not show notification:', notificationError);
      // Don't fail the whole operation for notification issues
    }
    
    // Refresh status with better error handling
    setTimeout(() => {
      try {
        this.loadCurrentUserIPTVStatus();
      } catch (statusError) {
        console.warn('⚠️ Could not refresh IPTV status:', statusError);
      }
    }, 1000);
    
  } catch (error) {
    console.error('❌ Error saving linked account:', error);
    
    // Reset interface state
    this.userHasExistingIPTVData = false;
    
    // Reset button if it exists
    const linkBtn = document.querySelector('.link-account-btn');
    if (linkBtn) {
      linkBtn.innerHTML = '<i class="fas fa-link"></i> Link Account';
      linkBtn.disabled = false;
    }
    
    // Show error notification with better error handling
    try {
      if (window.Utils && typeof window.Utils.showNotification === 'function') {
        window.Utils.showNotification(`Failed to save linked account: ${error.message}`, 'error');
      } else if (window.showNotification && typeof window.showNotification === 'function') {
        window.showNotification(`Failed to save linked account: ${error.message}`, 'error');
      } else {
        console.error('❌ Failed to save linked account:', error.message);
        alert(`Failed to save linked account: ${error.message}`);
      }
    } catch (notificationError) {
      console.warn('⚠️ Could not show error notification:', notificationError);
      // Fallback to alert
      alert(`Failed to save linked account: ${error.message}`);
    }
    
    throw error; // Re-throw so calling code knows it failed
  }
},

  /**
   * Show channel group creation form (Fixed for settings page)
   */
  showChannelGroupForm() {
    console.log('📋 Opening channel group form...');
    
    // Show the form that's already in the settings page instead of creating a modal
    const form = document.getElementById('channelGroupForm');
    if (form) {
      form.style.display = 'block';
      const title = document.getElementById('channelGroupFormTitle');
      if (title) title.textContent = 'Create New Channel Group';
      
      // Clear the form
      const nameField = document.getElementById('channelGroupName');
      const descField = document.getElementById('channelGroupDescription');
      if (nameField) nameField.value = '';
      if (descField) descField.value = '';
      
      // Load bouquets for selection
      this.loadBouquetsForSelection();
      
      // Scroll to form
      form.scrollIntoView({ behavior: 'smooth' });
    } else {
      console.error('❌ Channel group form not found in settings page');
      if (window.Utils && window.Utils.showNotification) {
        window.Utils.showNotification('Channel group form not found', 'error');
      } else if (window.showNotification) {
        window.showNotification('Channel group form not found', 'error');
      }
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
    if (window.Utils && window.Utils.showNotification) {
      window.Utils.showNotification(`Selected all ${category} bouquets`, 'success');
    } else if (window.showNotification) {
      window.showNotification(`Selected all ${category} bouquets`, 'success');
    }
  },

  /**
   * Select all bouquets
   */
  selectAllBouquets() {
    const checkboxes = document.querySelectorAll('#bouquetSelectionContainer input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      checkbox.checked = true;
    });
    if (window.Utils && window.Utils.showNotification) {
      window.Utils.showNotification('Selected all bouquets', 'success');
    } else if (window.showNotification) {
      window.showNotification('Selected all bouquets', 'success');
    }
  },

  /**
   * Clear all bouquet selections
   */
  clearAllBouquets() {
    const checkboxes = document.querySelectorAll('#bouquetSelectionContainer input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      checkbox.checked = false;
    });
    if (window.Utils && window.Utils.showNotification) {
      window.Utils.showNotification('Cleared all selections', 'info');
    } else if (window.showNotification) {
      window.showNotification('Cleared all selections', 'info');
    }
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
      const editingId = form ? form.getAttribute('data-editing-id') : null;
      const isEditing = !!editingId;
      
      const nameField = document.getElementById('channelGroupName');
      const descField = document.getElementById('channelGroupDescription');
      
      const name = nameField ? nameField.value.trim() : '';
      const description = descField ? descField.value.trim() : '';
      
      // Get selected bouquet IDs
      const selectedCheckboxes = document.querySelectorAll('#bouquetSelectionContainer input[type="checkbox"]:checked');
      const bouquetIds = Array.from(selectedCheckboxes).map(cb => cb.value);
      
      // Validation
      if (!name) {
        if (window.Utils && window.Utils.showNotification) {
          window.Utils.showNotification('Please enter a group name', 'error');
        } else if (window.showNotification) {
          window.showNotification('Please enter a group name', 'error');
        }
        return;
      }
      
      if (bouquetIds.length === 0) {
        if (window.Utils && window.Utils.showNotification) {
          window.Utils.showNotification('Please select at least one bouquet', 'error');
        } else if (window.showNotification) {
          window.showNotification('Please select at least one bouquet', 'error');
        }
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
      
      if (window.Utils && window.Utils.showNotification) {
        window.Utils.showNotification(`Channel group "${name}" ${isEditing ? 'updated' : 'created'} with ${bouquetIds.length} bouquets!`, 'success');
      } else if (window.showNotification) {
        window.showNotification(`Channel group "${name}" ${isEditing ? 'updated' : 'created'} with ${bouquetIds.length} bouquets!`, 'success');
      }
      
      // Hide form and refresh list
      this.hideChannelGroupForm();
      if (form) form.removeAttribute('data-editing-id');
      
      if (typeof this.loadChannelGroups === 'function') {
        await this.loadChannelGroups();
      }
      
      // Refresh dropdowns if they exist
      if (document.getElementById('defaultTrialGroup')) {
        await this.populateDefaultGroupDropdowns();
      }
      
    } catch (error) {
      console.error(`❌ Failed to ${editingId ? 'update' : 'create'} channel group:`, error);
      if (window.Utils && window.Utils.showNotification) {
        window.Utils.showNotification(`Failed to ${editingId ? 'update' : 'create'} channel group: ${error.message}`, 'error');
      } else if (window.showNotification) {
        window.showNotification(`Failed to ${editingId ? 'update' : 'create'} channel group: ${error.message}`, 'error');
      }
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
      const trialGroupSetting = settings.find && settings.find(s => s.setting_key === 'iptv_default_trial_group');
      const paidGroupSetting = settings.find && settings.find(s => s.setting_key === 'iptv_default_paid_group');
      
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
      await this.loadChannelGroups();
      
      const trialSelect = document.getElementById('defaultTrialGroup');
      const paidSelect = document.getElementById('defaultPaidGroup');
      
      if (trialSelect && paidSelect) {
        // Clear existing options (except first)
        trialSelect.innerHTML = '<option value="">None selected</option>';
        paidSelect.innerHTML = '<option value="">None selected</option>';
        
        // Add groups as options
        this.channelGroups.forEach(group => {
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
   * Initialize channel groups section (call this when settings page loads)
   */
  async initChannelGroupsSection() {
    try {
      console.log('📋 Initializing channel groups section...');
      
      // Load channel groups
      await this.loadChannelGroups();
      
      // Populate default group dropdowns
      await this.populateDefaultGroupDropdowns();
      
      console.log('✅ Channel groups section initialized');
      
    } catch (error) {
      console.error('❌ Failed to initialize channel groups section:', error);
    }
  },
  
  /**
   * Test IPTV Editor automation workflow - NEW METHOD
   */
     /**
   * Test IPTV Editor automation workflow - NEW METHOD
   */
     /**
   * Test IPTV Editor automation workflow - NEW METHOD
   */
     /**
   * Test IPTV Editor automation workflow - NEW METHOD
   */
  async testIPTVEditorAutomation(userId) {
    try {
        console.log(`🧪 Testing IPTV Editor automation for user ${userId}...`);
        
        const requestData = {
            user_id: parseInt(userId)
        };
        
        console.log('📤 Sending test automation request:', requestData);
        
        // Make API request to test endpoint
        const response = await fetch('/api/iptv/test-iptv-editor-automation', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.message || `HTTP ${response.status}: ${response.statusText}`);
        }
        
        if (!result.success) {
            throw new Error(result.message || 'Test automation failed');
        }
        
        console.log('✅ IPTV Editor automation test completed:', result);
        
        // Show detailed results
        const userData = result.data.user_info;
        const editorResults = result.data.iptv_editor_results;
        
        let statusMessage = `🧪 Test Results for ${userData.name} (${userData.iptv_username}):\n\n`;
        
        if (editorResults.iptv_editor_success) {
            if (editorResults.iptv_editor_created) {
                statusMessage += '✅ IPTV Editor user created successfully!\n';
                statusMessage += `📝 IPTV Editor ID: ${editorResults.iptv_editor_data.iptv_editor_id}\n`;
                if (editorResults.iptv_editor_data.m3u_url) {
                    statusMessage += `🔗 M3U URL: ${editorResults.iptv_editor_data.m3u_url}\n`;
                }
                if (editorResults.iptv_editor_data.epg_url) {
                    statusMessage += `📺 EPG URL: ${editorResults.iptv_editor_data.epg_url}\n`;
                }
            } else if (editorResults.iptv_editor_synced) {
                statusMessage += '✅ IPTV Editor user found and synced successfully!\n';
                statusMessage += `📝 IPTV Editor ID: ${editorResults.iptv_editor_data.iptv_editor_id}\n`;
            }
            
            if (editorResults.iptv_editor_data.sync_status === 'synced') {
                statusMessage += '🔄 Sync Status: Successfully synced\n';
            }
        } else {
            statusMessage += '❌ IPTV Editor automation failed\n';
            if (editorResults.iptv_editor_data?.error) {
                statusMessage += `Error: ${editorResults.iptv_editor_data.error}\n`;
            }
        }
        
        statusMessage += `\n⏰ Test completed at: ${new Date().toLocaleString()}`;
        
        // Show notification
if (window.Utils && window.Utils.showNotification) {
  window.Utils.showNotification(statusMessage, editorResults.iptv_editor_success ? 'success' : 'error');
} else {
  alert(statusMessage);
}
        
// Update UI if successful - Use same method as real IPTV subscription creation
if (editorResults.iptv_editor_success) {
  console.log('🔄 Refreshing IPTV status display after successful IPTV Editor creation...');
  
  // Create fake result data structure to match what updateIPTVStatus expects
  const updateData = {
    iptv_editor_created: editorResults.iptv_editor_created,
    iptv_editor_synced: editorResults.iptv_editor_synced,
    iptv_editor_success: editorResults.iptv_editor_success,
    iptv_editor_data: editorResults.iptv_editor_data
  };
  
  // Use the exact same methods as real IPTV subscription creation
  if (typeof this.updateIPTVStatus === 'function') {
    this.updateIPTVStatus(updateData);
  }
  
  if (typeof this.populateFormFieldsAfterCreation === 'function') {
    this.populateFormFieldsAfterCreation(updateData);
  }
}
        
        return result;
        
    } catch (error) {
        console.error('❌ IPTV Editor automation test failed:', error);
        
        this.showNotification(
            `❌ Test failed: ${error.message}`,
            'error'
        );
        
        throw error;
    }
  },

  /**
   * Event handler for test button - NEW METHOD
   */
  async handleTestIPTVEditorAutomation() {
    try {
        const userId = this.getCurrentUserId();
        
        if (!userId) {
            if (window.Utils && window.Utils.showNotification) {
  window.Utils.showNotification('Please select a user first', 'warning');
} else {
  alert('Please select a user first');
}
            return;
        }
        
        await this.testIPTVEditorAutomation(userId);
        
    } catch (error) {
        console.error('Test button error:', error);
    }
  }
};

// CRITICAL: Export to global scope IMMEDIATELY
window.IPTV = IPTV;
window.IPTVUser = IPTV;
// Make updateIPTVStatus available globally for utils.js
window.updateIPTVStatus = IPTV.updateIPTVStatus.bind(IPTV);

// Global function for trial user checkbox changes
window.handleTrialUserChange = function() {
  if (window.IPTV && typeof window.IPTV.handleTrialUserChange === 'function') {
    return window.IPTV.handleTrialUserChange();
  } else {
    console.error('❌ IPTV.handleTrialUserChange not available');
  }
};

// Make sure syncCredits is available globally for onclick handlers
window.syncIPTVCredits = function() {
  if (window.IPTV && typeof window.IPTV.syncCredits === 'function') {
    return window.IPTV.syncCredits();
  } else {
    console.error('❌ IPTV.syncCredits not available');
    alert('IPTV module not loaded properly. Please refresh the page.');
  }
};

// UserFormIPTV module - Copy of SettingsIPTV pattern
const UserFormIPTV = {
  /**
   * Load credit balance from database (exact copy of settings page pattern)
   */
  async loadCreditBalance() {
    try {
      console.log('💳 Loading credit balance from database...');
      
      // Load settings from database (same as settings page)
      const response = await fetch('/api/settings');
      const data = await response.json();
      
      // Load current credit balance from database
      if (data.success && data.settings) {
        const creditSetting = data.settings.find(s => s.setting_key === 'iptv_credits_balance');
        if (creditSetting) {
          const creditElement = document.getElementById('currentCreditBalance');
          if (creditElement) {
            creditElement.textContent = creditSetting.setting_value || 0;
          }
          
          // Update IPTV object balance too
          if (window.IPTV) {
            window.IPTV.creditBalance = parseInt(creditSetting.setting_value) || 0;
          }
          
          console.log(`💳 Loaded credits from DB: ${creditSetting.setting_value}`);
        } else {
          // Default to 0 if not found
          const creditElement = document.getElementById('currentCreditBalance');
          if (creditElement) {
            creditElement.textContent = '0';
          }
        }
      }
      
    } catch (error) {
      console.error('❌ Failed to load credit balance from database:', error);
      
      // Set default values if loading fails
      const creditElement = document.getElementById('currentCreditBalance');
      if (creditElement) {
        creditElement.textContent = '-';
      }
    }
  },

  /**
   * Sync credit balance (exact copy of settings page pattern)
   */
  async syncCredits() {
    try {
      if (window.Utils && window.Utils.showNotification) {
        window.Utils.showNotification('Syncing credit balance...', 'info');
      }
      
      const response = await fetch('/api/iptv/sync-credits', { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        const credits = data.credits || 0;
        
        // Update the display immediately
        const creditElement = document.getElementById('currentCreditBalance');
        if (creditElement) {
          creditElement.textContent = credits;
        }
        
        // Update IPTV object balance too
        if (window.IPTV) {
          window.IPTV.creditBalance = credits;
        }
        
        if (window.Utils && window.Utils.showNotification) {
          window.Utils.showNotification(`Credit balance: ${credits}`, 'success');
        } else if (window.showNotification) {
          window.showNotification(`Credit balance: ${credits}`, 'success');
        }
      } else {
        throw new Error(data.message);
      }
    } catch (error) {
      console.error('Failed to sync credits:', error);
      if (window.Utils && window.Utils.showNotification) {
        window.Utils.showNotification('Failed to sync credits', 'error');
      } else if (window.showNotification) {
        window.showNotification('Failed to sync credits', 'error');
      }
    }
  }
};

// Make it globally available for onclick handlers (same pattern as settings)
window.UserFormIPTV = UserFormIPTV;

// Initialize when document is ready
$(document).ready(() => {
  // Initialize IPTV module if we're on a page that needs it
  if (window.location.pathname.includes('users') || window.location.pathname === '/') {
    IPTV.init();
  }
});

console.log('📺 IPTV user module loaded cleanly');
console.log('🔍 Available IPTV functions:', Object.keys(window.IPTV).filter(k => typeof window.IPTV[k] === 'function'));

// Initialize form when page loads
document.addEventListener('DOMContentLoaded', function() {
    // Wait for elements to be available
    setTimeout(() => {
        if (typeof IPTV !== 'undefined' && IPTV.handleActionChange) {
            // Initialize form state
            if (document.getElementById('iptvActionCreate')) {
                IPTV.handleActionChange();
            }
            
            // Load credit balance if element exists
            if (document.getElementById('currentCreditBalance')) {
                IPTV.loadCreditBalance();
            }
        }
    }, 1000);
});