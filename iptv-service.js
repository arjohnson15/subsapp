// iptv-service.js - IPTV Panel API Integration Service - FIXED VERSION
const axios = require('axios');
const db = require('./database-config');

class IPTVService {
  constructor() {
    this.csrfToken = null;
    this.csrfExpires = null;
	this.sessionCookies = null;
    this.session = null;
    this.baseURL = null;
    this.loginURL = null;
    this.username = null;
    this.password = null;
    this.packageIdForBouquets = '46'; // Default package ID for bouquet queries
  }

  /**
   * Initialize service with current settings from database
   */
  async initialize() {
    try {
      const settings = await this.getSettings();
      this.baseURL = settings.iptv_panel_base_url || '';
      this.loginURL = settings.iptv_panel_login_url || '';
      this.username = settings.iptv_panel_username || '';
      this.password = settings.iptv_panel_password || '';
      this.packageIdForBouquets = settings.iptv_package_id_for_bouquets || '46';
      this.csrfToken = settings.iptv_csrf_token || null;
	  this.sessionCookies = settings.iptv_session_cookies || null;
      
      if (settings.iptv_csrf_expires) {
        this.csrfExpires = new Date(settings.iptv_csrf_expires);
      }
      
      console.log('📺 IPTV Service initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize IPTV service:', error);
      return false;
    }
  }

/**
 * Get IPTV settings from database - SIMPLE FIX
 */
async getSettings() {
  try {
    const result = await db.query(`
      SELECT setting_key, setting_value 
      FROM settings 
      WHERE setting_key IN (
        'iptv_panel_base_url',
        'iptv_panel_login_url', 
        'iptv_panel_username',
        'iptv_panel_password',
        'iptv_package_id_for_bouquets',
        'iptv_csrf_token',
        'iptv_session_cookies',
        'iptv_csrf_expires',
        'iptv_credits_balance'
      )
    `);
    
    // Since result is already the array of rows, use it directly
    const rows = result;
    
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      console.log('⚠️ No IPTV settings found in database');
      return {};
    }
    
    const settings = {};
    rows.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });
    
    console.log('🔍 DEBUG: Loaded IPTV settings:', settings);
    return settings;
  } catch (error) {
    console.error('❌ Error getting IPTV settings:', error);
    return {};
  }
}

/**
 * DEBUG: Direct settings check
 */
async debugSettings() {
  try {
    console.log('🔧 DEBUG: Checking database connection...');
    const testResult = await db.query('SELECT COUNT(*) as count FROM settings');
    console.log('🔧 DEBUG: Total settings in database:', testResult);
    
    console.log('🔧 DEBUG: Getting all settings...');
    const allSettings = await db.query('SELECT * FROM settings ORDER BY setting_key');
    console.log('🔧 DEBUG: All settings:', allSettings);
    
    console.log('🔧 DEBUG: Looking for IPTV URLs specifically...');
    const urlSettings = await db.query(`
      SELECT setting_key, setting_value 
      FROM settings 
      WHERE setting_key IN ('iptv_panel_base_url', 'iptv_panel_login_url')
    `);
    console.log('🔧 DEBUG: URL settings:', urlSettings);
    
    return urlSettings;
  } catch (error) {
    console.error('❌ DEBUG: Database error:', error);
    return null;
  }
}

  /**
   * Update setting in database
   */
  async updateSetting(key, value) {
    await db.query(`
      UPDATE settings 
      SET setting_value = ?, updated_at = NOW() 
      WHERE setting_key = ?
    `, [value, key]);
  }

/**
 * Check if we have valid authentication - FIXED FOR CSRF ONLY
 */
isAuthenticated() {
  if (!this.csrfToken) return false;
  if (!this.csrfExpires) return false;
  return new Date() < this.csrfExpires;
}

/**
 * Get CSRF token from login page - WITH COOKIE CAPTURE
 */
async getCSRFToken() {
  try {
    console.log('🔑 Getting CSRF token from:', this.loginURL);
    
    const response = await axios.get(this.loginURL, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    // Extract CSRF token using EXACT same logic as your Postman script
    const responseText = response.data;
    let csrfToken = null;
    
    // First look for form token
    const tokenMatch = responseText.match(/name="_token"\s+value="([^"]+)"/);
    if (tokenMatch) {
      csrfToken = tokenMatch[1];
      console.log("CSRF Token found:", tokenMatch[1]);
    }
    
    // Then look for meta token (this will overwrite form token if present)
    const metaMatch = responseText.match(/name="csrf-token"\s+content="([^"]+)"/);
    if (metaMatch) {
      csrfToken = metaMatch[1];
      console.log("Meta CSRF Token found:", metaMatch[1]);
    }
    
    if (!csrfToken) {
      throw new Error('CSRF token not found in login page');
    }
    
    // CRITICAL: Capture the session cookies that came with the CSRF token
    const setCookieHeaders = response.headers['set-cookie'];
    if (setCookieHeaders) {
      this.sessionCookies = setCookieHeaders.map(cookie => cookie.split(';')[0]).join('; ');
      console.log('🍪 Captured session cookies for login:', this.sessionCookies.substring(0, 50) + '...');
    }
    
    return csrfToken;
  } catch (error) {
    console.error('❌ Failed to get CSRF token:', error.message);
    throw new Error(`Failed to get CSRF token: ${error.message}`);
  }
}

/**
 * Login to IPTV panel - WITH SESSION COOKIES LIKE POSTMAN
 */
async loginToPanel() {
  try {
    console.log('🔐 Logging into IPTV panel...');
    
    // Step 1: Get CSRF token (this also captures session cookies)
    const csrfToken = await this.getCSRFToken();
    
    // Step 2: Login using the session cookies (like Postman does automatically)
    const formData = new URLSearchParams();
    formData.append('username', this.username);
    formData.append('password', this.password);
    formData.append('_token', csrfToken);

    console.log('🔐 Posting login with session cookies...');
    console.log('🍪 Using cookies:', this.sessionCookies ? 'YES' : 'NO');

    const response = await axios.post(this.loginURL, formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-CSRF-TOKEN': csrfToken,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': this.loginURL,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cookie': this.sessionCookies || ''  // Send the session cookies!
      },
      timeout: 15000,
      maxRedirects: 5,  // Follow redirects like Postman
      validateStatus: (status) => status >= 200 && status < 400
    });

    console.log('🔐 Login successful! Status:', response.status);

    // Update session cookies with any new ones from login response
    const setCookieHeaders = response.headers['set-cookie'];
    if (setCookieHeaders) {
      const newCookies = setCookieHeaders.map(cookie => cookie.split(';')[0]).join('; ');
      this.sessionCookies = newCookies;
      console.log('🍪 Updated session cookies after login');
    }

    // Store authentication data
    this.csrfToken = csrfToken;
    this.csrfExpires = new Date(Date.now() + (60 * 60 * 1000));
    
    // Save to database
    await this.updateSetting('iptv_csrf_token', csrfToken);
    await this.updateSetting('iptv_session_cookies', this.sessionCookies);
    await this.updateSetting('iptv_csrf_expires', this.csrfExpires.toISOString());
    
    console.log('✅ Successfully logged into IPTV panel');
    return true;
  } catch (error) {
    console.error('❌ Login failed:', error.message);
    if (error.response) {
      console.error('🔍 Status:', error.response.status);
      console.error('🔍 Headers:', Object.keys(error.response.headers));
      console.error('🔍 Data sample:', error.response.data?.toString().substring(0, 200));
    }
    throw new Error(`Login failed: ${error.message}`);
  }
}

/**
 * Check if we have valid authentication - UPDATED FOR COOKIES
 */
isAuthenticated() {
  if (!this.csrfToken) return false;
  if (!this.csrfExpires) return false;
  if (!this.sessionCookies) return false;  // We DO need session cookies
  return new Date() < this.csrfExpires;
}

  /**
   * Ensure we have valid authentication, refresh if needed
   */
async ensureAuthenticated() {
  if (!this.baseURL || !this.loginURL || !this.username || !this.password) {
    throw new Error('IPTV panel credentials not configured');
  }

  if (this.isAuthenticated()) {
    console.log('✅ Using existing authentication'); // ADD THIS LINE
    return true;
  }

  console.log('🔄 Authentication expired or missing, performing fresh login...'); // CHANGE THIS LINE
  return await this.loginToPanel();
}

/**
 * Make authenticated API request - WITH SESSION COOKIES
 */
async makeAPIRequest(endpoint, data = {}, method = 'POST') {
  await this.ensureAuthenticated();

  const url = `${this.baseURL}${endpoint}`;

  try {
    const response = await axios({
      method,
      url,
      data: method === 'GET' ? undefined : new URLSearchParams({
        '_token': this.csrfToken,
        ...data
      }),
      params: method === 'GET' ? { _token: this.csrfToken, ...data } : undefined,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-CSRF-TOKEN': this.csrfToken,
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Cookie': this.sessionCookies || ''
      }
    });

    return response.data;
  } catch (error) {
    console.error(`❌ API request failed for ${endpoint}:`, error.message);
    
    // If authentication failed, try once more with fresh login
    if (error.response?.status === 401 || error.response?.status === 403 || error.response?.status === 419) {
      console.log('🔄 Authentication error, trying fresh login...');
      await this.loginToPanel();
      
      const retryResponse = await axios({
        method,
        url,
        data: method === 'GET' ? undefined : new URLSearchParams({ '_token': this.csrfToken, ...data }),
        params: method === 'GET' ? { _token: this.csrfToken, ...data } : undefined,
        timeout: 15000,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-CSRF-TOKEN': this.csrfToken,
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': '*/*',
          'Cookie': this.sessionCookies || ''
        }
      });
      
      return retryResponse.data;
    }
    
    throw error;
  }
}

/**
 * Test connection to IPTV panel - CLEAN VERSION
 */
async testConnection() {
  try {
    await this.initialize();
    
    if (!this.loginURL) {
      throw new Error('Login URL is empty - settings not configured');
    }
    
    // Force a fresh login to test the complete flow
    console.log('🧪 Testing connection with fresh authentication...');
    await this.loginToPanel();
    
    // Try to get packages as a test of authenticated API access
    console.log('🧪 Testing API access with packages endpoint...');
    const packages = await this.getPackagesFromPanel();
    
    return {
      success: true,
      message: `Connection successful. Found ${packages.length} packages. Authentication working properly.`,
      packages: packages.length,
      csrf_token: this.csrfToken ? 'Present' : 'Missing'
    };
  } catch (error) {
    console.error('❌ Test connection failed:', error);
    return {
      success: false,
      message: error.message,
      error: error.toString(),
      csrf_token: this.csrfToken ? 'Present' : 'Missing'
    };
  }
}

/**
 * Refresh authentication (for hourly cron job) - FIXED VERSION
 */
async refreshAuthentication() {
  try {
    console.log('🔄 Refreshing IPTV authentication...');
    await this.initialize();
    await this.loginToPanel();
    console.log('✅ IPTV authentication refreshed successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to refresh IPTV authentication:', error);
    return false;
  }
}

  /**
   * Get packages from IPTV panel
   */
  async getPackagesFromPanel() {
    try {
      const response = await this.makeAPIRequest('/lines/packages');
      
      if (response && Array.isArray(response)) {
        return response;
      }
      
      // Handle different response formats
      if (response && response.packages) {
        return response.packages;
      }
      
      console.warn('⚠️ Unexpected packages response format:', response);
      return [];
    } catch (error) {
      console.error('❌ Failed to get packages:', error);
      throw new Error(`Failed to get packages: ${error.message}`);
    }
  }

  /**
   * Get bouquets for a specific package
   */
  async getBouquetsFromPanel(packageId = null) {
    try {
      const pkgId = packageId || this.packageIdForBouquets;
      const response = await this.makeAPIRequest('/lines/packages', { package_id: pkgId });
      
      if (response && response.bouquets) {
        return response.bouquets;
      }
      
      console.warn('⚠️ Unexpected bouquets response format:', response);
      return [];
    } catch (error) {
      console.error('❌ Failed to get bouquets:', error);
      throw new Error(`Failed to get bouquets: ${error.message}`);
    }
  }

  /**
   * Get all users from IPTV panel
   */
  async getAllPanelUsers() {
    try {
      const response = await this.makeAPIRequest('/lines/data');
      
      if (response && Array.isArray(response)) {
        return response;
      }
      
      if (response && response.users) {
        return response.users;
      }
      
      console.warn('⚠️ Unexpected users response format:', response);
      return [];
    } catch (error) {
      console.error('❌ Failed to get panel users:', error);
      throw new Error(`Failed to get panel users: ${error.message}`);
    }
  }

  /**
   * Get specific user from IPTV panel
   */
  async getUserFromPanel(lineId) {
    try {
      const response = await this.makeAPIRequest(`/lines/edit/${lineId}`);
      return response;
    } catch (error) {
      console.error(`❌ Failed to get user ${lineId}:`, error);
      throw new Error(`Failed to get user: ${error.message}`);
    }
  }

  /**
   * Create trial user (24 hours)
   */
  async createTrialUser(username, password, packageId, bouquetIds = []) {
    try {
      console.log(`🆓 Creating trial user: ${username}`);
      
      const bouquetString = Array.isArray(bouquetIds) ? bouquetIds.join(',') : bouquetIds;
      
      const data = {
        line_type: 'line',
        username: username,
        password: password || '', // Auto-generated if empty
        mac: '',
        forced_country: 'US',
        package: packageId,
        current_bouquets: bouquetString,
        description: `Trial user created via JohnsonFlix Manager`
      };

      const response = await this.makeAPIRequest('/lines/create/1', data);
      
      // Log the creation
      await this.logActivity(null, null, 'create_trial', packageId, 0, true, null, response);
      
      console.log(`✅ Trial user created successfully: ${username}`);
      return response;
    } catch (error) {
      console.error(`❌ Failed to create trial user ${username}:`, error);
      await this.logActivity(null, null, 'create_trial', packageId, 0, false, error.message, null);
      throw new Error(`Failed to create trial user: ${error.message}`);
    }
  }

  /**
   * Create paid user
   */
  async createPaidUser(username, password, packageId, bouquetIds = []) {
    try {
      console.log(`💰 Creating paid user: ${username}`);
      
      // Get package info for credit calculation
      const packageInfo = await this.getPackageInfo(packageId);
      const credits = packageInfo ? packageInfo.credits : 0;
      
      const bouquetString = Array.isArray(bouquetIds) ? bouquetIds.join(',') : bouquetIds;
      
      const data = {
        line_type: 'line',
        username: username,
        password: password || '', // Auto-generated if empty
        mac: '',
        forced_country: 'US',
        package: packageId,
        current_bouquets: bouquetString,
        description: `Paid user created via JohnsonFlix Manager`
      };

      const response = await this.makeAPIRequest('/lines/create/0', data);
      
      // Update local credit balance
      await this.updateLocalCredits(-credits);
      
      // Log the creation
      await this.logActivity(null, response.id || null, 'create_paid', packageId, credits, true, null, response);
      
      console.log(`✅ Paid user created successfully: ${username}`);
      return response;
    } catch (error) {
      console.error(`❌ Failed to create paid user ${username}:`, error);
      await this.logActivity(null, null, 'create_paid', packageId, 0, false, error.message, null);
      throw new Error(`Failed to create paid user: ${error.message}`);
    }
  }

  /**
   * Extend existing user subscription
   */
  async extendUser(lineId, packageId, bouquetIds = []) {
    try {
      console.log(`🔄 Extending user ${lineId} with package ${packageId}`);
      
      // Get package info for credit calculation
      const packageInfo = await this.getPackageInfo(packageId);
      const credits = packageInfo ? packageInfo.credits : 0;
      
      const bouquetString = Array.isArray(bouquetIds) ? bouquetIds.join(',') : bouquetIds;
      
      const data = {
        package: packageId,
        current_bouquets: bouquetString
      };

      const response = await this.makeAPIRequest(`/lines/extend/${lineId}`, data);
      
      // Update local credit balance
      await this.updateLocalCredits(-credits);
      
      // Log the extension
      await this.logActivity(null, lineId, 'extend', packageId, credits, true, null, response);
      
      console.log(`✅ User ${lineId} extended successfully`);
      return response;
    } catch (error) {
      console.error(`❌ Failed to extend user ${lineId}:`, error);
      await this.logActivity(null, lineId, 'extend', packageId, 0, false, error.message, null);
      throw new Error(`Failed to extend user: ${error.message}`);
    }
  }

  /**
   * Get current credit balance from panel
   */
  async getCreditBalance() {
    try {
      const response = await this.makeAPIRequest('/logs/credits', {}, 'GET');
      
      if (response && typeof response.balance !== 'undefined') {
        return parseInt(response.balance);
      }
      
      // Handle different response formats
      if (response && typeof response.credits !== 'undefined') {
        return parseInt(response.credits);
      }
      
      console.warn('⚠️ Unexpected credits response format:', response);
      return 0;
    } catch (error) {
      console.error('❌ Failed to get credit balance:', error);
      throw new Error(`Failed to get credit balance: ${error.message}`);
    }
  }

  /**
   * Update local credit balance in database
   */
  async updateLocalCredits(amount) {
    try {
      const currentBalance = await this.getLocalCreditBalance();
      const newBalance = currentBalance + amount;
      
      await this.updateSetting('iptv_credits_balance', newBalance.toString());
      console.log(`💳 Credits updated: ${currentBalance} → ${newBalance} (${amount > 0 ? '+' : ''}${amount})`);
      
      return newBalance;
    } catch (error) {
      console.error('❌ Failed to update local credits:', error);
      throw error;
    }
  }

  /**
   * Get local credit balance from database
   */
  async getLocalCreditBalance() {
    try {
      const settings = await this.getSettings();
      return parseInt(settings.iptv_credits_balance) || 0;
    } catch (error) {
      console.error('❌ Failed to get local credit balance:', error);
      return 0;
    }
  }

  /**
   * Sync credit balance from panel to local database
   */
  async syncCreditBalance() {
    try {
      console.log('💳 Syncing credit balance from panel...');
      const panelBalance = await this.getCreditBalance();
      await this.updateSetting('iptv_credits_balance', panelBalance.toString());
      console.log(`✅ Credit balance synced: ${panelBalance} credits`);
      return panelBalance;
    } catch (error) {
      console.error('❌ Failed to sync credit balance:', error);
      throw error;
    }
  }

  /**
   * Sync packages from panel to database
   */
  async syncPackagesFromPanel() {
    try {
      console.log('📦 Syncing packages from panel...');
      
      const packages = await this.getPackagesFromPanel();
      
      // Clear existing packages
      await db.query('DELETE FROM iptv_packages');
      
      // Insert new packages
      for (const pkg of packages) {
        const packageType = this.determinePackageType(pkg.id, pkg.name);
        
        await db.query(`
          INSERT INTO iptv_packages (package_id, name, connections, duration_months, credits, package_type, synced_at)
          VALUES (?, ?, ?, ?, ?, ?, NOW())
        `, [
          pkg.id,
          pkg.name || `Package ${pkg.id}`,
          pkg.connections || 1,
          pkg.duration_months || 1,
          pkg.credits || 1,
          packageType
        ]);
      }
      
      await this.updateSetting('iptv_last_sync', new Date().toISOString());
      console.log(`✅ Synced ${packages.length} packages from panel`);
      
      return packages.length;
    } catch (error) {
      console.error('❌ Failed to sync packages:', error);
      throw error;
    }
  }

  /**
   * Sync bouquets from panel to database
   */
  async syncBouquetsFromPanel() {
    try {
      console.log('📺 Syncing bouquets from panel...');
      
      const bouquets = await this.getBouquetsFromPanel();
      
      // Clear existing bouquets
      await db.query('DELETE FROM iptv_bouquets');
      
      // Insert new bouquets
      for (const bouquet of bouquets) {
        await db.query(`
          INSERT INTO iptv_bouquets (bouquet_id, name, category, synced_at)
          VALUES (?, ?, ?, NOW())
        `, [
          bouquet.id,
          bouquet.name || `Bouquet ${bouquet.id}`,
          bouquet.category || 'General'
        ]);
      }
      
      console.log(`✅ Synced ${bouquets.length} bouquets from panel`);
      return bouquets.length;
    } catch (error) {
      console.error('❌ Failed to sync bouquets:', error);
      throw error;
    }
  }

  /**
   * Get package info from local database
   */
  async getPackageInfo(packageId) {
    try {
      const result = await db.query(
        'SELECT * FROM iptv_packages WHERE package_id = ? AND is_active = true',
        [packageId]
      );
      
      // Handle different return formats from mysql2
      const rows = Array.isArray(result) ? result[0] : result;
      return (Array.isArray(rows) && rows.length > 0) ? rows[0] : null;
    } catch (error) {
      console.error(`❌ Failed to get package info for ${packageId}:`, error);
      return null;
    }
  }

  /**
   * Determine package type based on ID and name
   */
  determinePackageType(packageId, packageName = '') {
    const id = parseInt(packageId);
    const name = packageName.toLowerCase();
    
    if (name.includes('trial')) return 'trial';
    if (name.includes('live') || (id >= 175 && id <= 186)) return 'live_tv';
    if (id >= 150 && id <= 174) return 'full';
    
    return 'basic';
  }

  /**
   * Log IPTV activity
   */
  async logActivity(userId, lineId, action, packageId, creditsUsed, success, errorMessage, apiResponse) {
    try {
      await db.query(`
        INSERT INTO iptv_activity_log (user_id, line_id, action, package_id, credits_used, success, error_message, api_response)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        userId,
        lineId,
        action,
        packageId,
        creditsUsed,
        success,
        errorMessage,
        JSON.stringify(apiResponse)
      ]);
    } catch (error) {
      console.error('❌ Failed to log IPTV activity:', error);
    }
  }

  /**
   * Get available packages from database - FIXED VERSION
   */
  async getAvailablePackages() {
    try {
      const result = await db.query(`
        SELECT * FROM iptv_packages 
        WHERE is_active = true 
        ORDER BY package_type, duration_months, connections
      `);
      
      // Handle different return formats from mysql2
      const rows = Array.isArray(result) ? result[0] : result;
      
      if (!rows || !Array.isArray(rows)) {
        console.log('⚠️ No packages found in database');
        return [];
      }
      
      return rows;
    } catch (error) {
      console.error('❌ Failed to get available packages:', error);
      return []; // Always return empty array on error
    }
  }

  /**
   * Get channel groups from database - FIXED VERSION
   */
  async getChannelGroups() {
    try {
      const result = await db.query(`
        SELECT * FROM iptv_channel_groups 
        WHERE is_active = true 
        ORDER BY name
      `);
      
      // Handle different return formats from mysql2
      const rows = Array.isArray(result) ? result[0] : result;
      
      if (!rows || !Array.isArray(rows)) {
        console.log('⚠️ No channel groups found in database');
        return [];
      }
      
      return rows;
    } catch (error) {
      console.error('❌ Failed to get channel groups:', error);
      return []; // Always return empty array on error
    }
  }

  /**
   * Create new channel group
   */
  async createChannelGroup(name, description, bouquetIds) {
    try {
      const result = await db.query(`
        INSERT INTO iptv_channel_groups (name, description, bouquet_ids)
        VALUES (?, ?, ?)
      `, [name, description, JSON.stringify(bouquetIds)]);
      
      // Handle different return formats from mysql2
      const insertResult = Array.isArray(result) ? result[0] : result;
      const insertId = insertResult.insertId;
      
      console.log(`✅ Created channel group: ${name}`);
      return insertId;
    } catch (error) {
      console.error(`❌ Failed to create channel group ${name}:`, error);
      throw error;
    }
  }

  /**
   * Update channel group
   */
  async updateChannelGroup(id, name, description, bouquetIds) {
    try {
      await db.query(`
        UPDATE iptv_channel_groups 
        SET name = ?, description = ?, bouquet_ids = ?, updated_at = NOW()
        WHERE id = ?
      `, [name, description, JSON.stringify(bouquetIds), id]);
      
      console.log(`✅ Updated channel group: ${name}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to update channel group ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete channel group
   */
  async deleteChannelGroup(id) {
    try {
      // Set users using this group to NULL
      await db.query(
        'UPDATE users SET iptv_channel_group_id = NULL WHERE iptv_channel_group_id = ?',
        [id]
      );
      
      // Delete the group
      await db.query('DELETE FROM iptv_channel_groups WHERE id = ?', [id]);
      
      console.log(`✅ Deleted channel group: ${id}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to delete channel group ${id}:`, error);
      throw error;
    }
  }

  /**
   * Generate iMPlayer code for user
   */
  generateiMPlayerCode(username, password) {
    // iMPlayer code format: typically the username or a combination
    // This might need adjustment based on actual iMPlayer requirements
    return username;
  }

  /**
   * Calculate expiration date based on package
   */
  calculateExpirationDate(packageInfo, isExtending = false, currentExpiration = null) {
    const now = new Date();
    let startDate = now;
    
    // If extending and user has future expiration, start from that date
    if (isExtending && currentExpiration) {
      const expDate = new Date(currentExpiration);
      if (expDate > now) {
        startDate = expDate;
      }
    }
    
    const months = packageInfo.duration_months || 1;
    const expirationDate = new Date(startDate);
    expirationDate.setMonth(expirationDate.getMonth() + months);
    
    return expirationDate;
  }
}

// Export singleton instance
module.exports = new IPTVService();