// iptv-service.js - IPTV Panel API Integration Service - FIXED VERSION
const axios = require('axios');
const db = require('./database-config');

class IPTVService {
  constructor() {
    this.baseURL = null;
    this.loginURL = null;
    this.username = null;
    this.password = null;
    this.packageIdForBouquets = null;
    this.csrfToken = null;
    this.sessionCookies = null;
    this.csrfExpires = null;
    this.creditsBalance = 0;
    
    // Track retry attempts to prevent infinite loops
    this.retryInProgress = false;
  }

  /**
   * Initialize service with settings from database
   */
  async initialize() {
    try {
      const settings = await this.loadSettings();
      this.baseURL = settings.iptv_panel_base_url;
      this.loginURL = settings.iptv_panel_login_url;
      this.username = settings.iptv_panel_username;
      this.password = settings.iptv_panel_password;
      this.packageIdForBouquets = settings.iptv_package_id_for_bouquets;
      this.csrfToken = settings.iptv_csrf_token;
      this.creditsBalance = settings.iptv_credits_balance || 0;
      
      // Parse session cookies
      this.sessionCookies = settings.iptv_session_cookies;
      
      // Parse expiration date
      if (settings.iptv_csrf_expires) {
        this.csrfExpires = new Date(settings.iptv_csrf_expires);
      }

      console.log('🎯 IPTV Service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize IPTV service:', error);
      throw error;
    }
  }

  /**
   * Load IPTV settings from database - FIXED VERSION
   */
  async loadSettings() {
    const connection = await db.getConnection();
    try {
      const [rows] = await connection.execute(
        'SELECT setting_key, setting_value FROM settings WHERE setting_key LIKE "iptv_%"'
      );
      
      const settings = {};
      rows.forEach(row => {
        settings[row.setting_key] = row.setting_value;
      });
      
      return settings;
    } finally {
      connection.release();
    }
  }

  /**
   * Get IPTV settings from database - SIMPLE FIX
   */
  async getSettings() {
    try {
      const connection = await db.getConnection();
      try {
        const [rows] = await connection.execute(`
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
      } finally {
        connection.release();
      }
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
      const connection = await db.getConnection();
      try {
        const [testResult] = await connection.execute('SELECT COUNT(*) as count FROM settings');
        console.log('🔧 DEBUG: Total settings in database:', testResult);
        
        console.log('🔧 DEBUG: Getting all settings...');
        const [allSettings] = await connection.execute('SELECT * FROM settings ORDER BY setting_key');
        console.log('🔧 DEBUG: All settings:', allSettings);
        
        console.log('🔧 DEBUG: Looking for IPTV URLs specifically...');
        const [urlSettings] = await connection.execute(`
          SELECT setting_key, setting_value 
          FROM settings 
          WHERE setting_key IN ('iptv_panel_base_url', 'iptv_panel_login_url')
        `);
        console.log('🔧 DEBUG: URL settings:', urlSettings);
        
        return urlSettings;
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('❌ DEBUG: Database error:', error);
      return null;
    }
  }

  /**
   * Update setting in database - FIXED VERSION
   */
  async updateSetting(key, value) {
    const connection = await db.getConnection();
    try {
      await connection.execute(
        'INSERT INTO settings (setting_key, setting_value, setting_type) VALUES (?, ?, "text") ' +
        'ON DUPLICATE KEY UPDATE setting_value = ?',
        [key, value, value]
      );
    } finally {
      connection.release();
    }
  }

  /**
   * Check if we have valid authentication - FIXED FOR CSRF AND COOKIES
   */
  isAuthenticated() {
    if (!this.csrfToken) return false;
    if (!this.csrfExpires) return false;
    if (!this.sessionCookies) return false;  // We DO need session cookies
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
   * Login to IPTV panel - WITH PROPER CSRF TOKEN EXTRACTION
   */
  async loginToPanel() {
    try {
      console.log('🔐 Logging into IPTV panel...');
      
      // Step 1: Get CSRF token (this also captures session cookies)
      const initialCsrfToken = await this.getCSRFToken();
      
      // Step 2: Login using the session cookies
      const formData = new URLSearchParams();
      formData.append('username', this.username);
      formData.append('password', this.password);
      formData.append('_token', initialCsrfToken);

      console.log('🔐 Posting login with session cookies...');

      const response = await axios.post(this.loginURL, formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-CSRF-TOKEN': initialCsrfToken,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Referer': this.loginURL,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Cookie': this.sessionCookies || ''
        },
        timeout: 15000,
        maxRedirects: 5,
        validateStatus: (status) => status >= 200 && status < 400
      });

      console.log('🔐 Login successful! Status:', response.status);

      // Step 3: CRITICAL - Extract the NEW CSRF token from response cookies
      const setCookieHeaders = response.headers['set-cookie'];
      if (setCookieHeaders) {
        const newCookies = setCookieHeaders.map(cookie => cookie.split(';')[0]).join('; ');
        this.sessionCookies = newCookies;
        
        // Extract the updated CSRF token from XSRF-TOKEN cookie
        const xsrfCookie = setCookieHeaders.find(cookie => cookie.startsWith('XSRF-TOKEN='));
        if (xsrfCookie) {
          try {
            // Get the cookie value (everything after XSRF-TOKEN=, before the first semicolon)
            const cookieValue = xsrfCookie.split('=')[1].split(';')[0];
            // Decode the URL-encoded value
            const decodedValue = decodeURIComponent(cookieValue);
            // Parse the JSON to get the Laravel encrypted cookie structure
            const tokenData = JSON.parse(decodedValue);
            
            // The actual CSRF token is in the 'value' field
            if (tokenData.value) {
              this.csrfToken = tokenData.value;
              console.log('🔑 Extracted updated CSRF token from cookie:', this.csrfToken.substring(0, 10) + '...');
            }
          } catch (error) {
            console.log('⚠️ Could not extract CSRF token from cookie, keeping login token');
            // Keep the login token if extraction fails
            this.csrfToken = initialCsrfToken;
          }
        } else {
          // No XSRF-TOKEN cookie found, keep the login token
          this.csrfToken = initialCsrfToken;
        }
        
        console.log('🍪 Updated session cookies after login');
      }

      // Store authentication data
      this.csrfExpires = new Date(Date.now() + (60 * 60 * 1000));
      
      // Save to database
      await this.updateSetting('iptv_csrf_token', this.csrfToken);
      await this.updateSetting('iptv_session_cookies', this.sessionCookies);
      await this.updateSetting('iptv_csrf_expires', this.csrfExpires.toISOString());
      
      console.log('✅ Successfully logged into IPTV panel with updated CSRF token');
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
   * Ensure we have valid authentication, refresh if needed
   */
  async ensureAuthenticated() {
    if (!this.baseURL || !this.loginURL || !this.username || !this.password) {
      throw new Error('IPTV panel credentials not configured');
    }

    if (this.isAuthenticated()) {
      console.log('✅ Using existing authentication');
      return true;
    }

    console.log('🔄 Authentication expired or missing, performing fresh login...');
    return await this.loginToPanel();
  }

  /**
   * Make authenticated API request - WITH SESSION COOKIES AND RETRY LOGIC
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
      
      // If authentication failed and we haven't already retried, try once more with fresh login
      if ((error.response?.status === 401 || error.response?.status === 403 || error.response?.status === 419) && !this.retryInProgress) {
        console.log('🔄 Authentication error, trying fresh login...');
        this.retryInProgress = true;
        
        try {
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
          
          this.retryInProgress = false;
          return retryResponse.data;
        } catch (retryError) {
          this.retryInProgress = false;
          throw retryError;
        }
      }
      
      throw error;
    }
  }

  /**
   * Test connection to IPTV panel - JUST TEST LOGIN
   */
  async testConnection() {
    try {
      await this.initialize();
      
      if (!this.loginURL) {
        throw new Error('Login URL is empty - settings not configured');
      }
      
      // Just test the login - that's it!
      console.log('🧪 Testing login to IPTV panel...');
      await this.loginToPanel();
      
      return {
        success: true,
        message: 'Login successful! IPTV panel authentication is working properly.',
        csrf_token: this.csrfToken ? 'Present' : 'Missing',
        session_cookies: this.sessionCookies ? 'Present' : 'Missing'
      };
    } catch (error) {
      console.error('❌ Test connection failed:', error);
      return {
        success: false,
        message: error.message,
        error: error.toString(),
        csrf_token: this.csrfToken ? 'Present' : 'Missing',
        session_cookies: this.sessionCookies ? 'Present' : 'Missing'
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
      const response = await this.makeAPIRequest(`/lines/edit/${lineId}`, {}, 'GET');
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
        q: '',
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
        q: '',
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
   * Sync credit balance from panel with enhanced parsing
   */
  async syncCreditsFromPanel() {
    try {
      console.log('🔄 Syncing credit balance from panel...');
      await this.ensureAuthenticated();
      
      // Get dashboard page with authentication
      const response = await axios.get(`${this.baseURL}/dashboard`, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Cookie': this.sessionCookies || '',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });

      const htmlContent = response.data;
      let credits = 0;
      
      // Multiple parsing patterns for credit extraction
      const patterns = [
        // Pattern 1: <div class="label label-warning">Credits: 8</div>
        /Credits:\s*(\d+)/i,
        
        // Pattern 2: JSON-like structure
        /["']credits["']:\s*["']?(\d+)["']?/i,
        
        // Pattern 3: Credit balance variations
        /credit[_\s]*balance["']?\s*[:=]\s*["']?(\d+)["']?/i,
        
        // Pattern 4: Laravel blade variable patterns
        /\{\{\s*\$credits\s*\}\}\s*(\d+)/i,
        
        // Pattern 5: Data attributes
        /data-credits\s*=\s*["'](\d+)["']/i
      ];
      
      for (let i = 0; i < patterns.length; i++) {
        const match = htmlContent.match(patterns[i]);
        if (match) {
          credits = parseInt(match[1], 10);
          console.log(`✅ Found credits using pattern ${i + 1}:`, credits);
          break;
        }
      }

      if (credits === 0) {
        console.log('⚠️ Could not parse credits from dashboard, trying API...');
        try {
          const apiResponse = await this.makeAPIRequest('/logs/credits', {}, 'GET');
          if (apiResponse && typeof apiResponse.balance !== 'undefined') {
            credits = parseInt(apiResponse.balance, 10);
            console.log('✅ Found credits via API:', credits);
          }
        } catch (apiError) {
          console.log('⚠️ Credits API also failed:', apiError.message);
        }
      }

      this.creditsBalance = credits;
      await this.updateSetting('iptv_credits_balance', credits.toString());
      
      console.log('✅ Credit balance synced:', credits, 'credits');
      return credits;
      
    } catch (error) {
      console.error('❌ Failed to sync credits:', error.message);
      throw error;
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
      const panelBalance = await this.syncCreditsFromPanel();
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
      
      const connection = await db.getConnection();
      try {
        // Clear existing packages
        await connection.execute('DELETE FROM iptv_packages');
        
        // Insert new packages
        for (const pkg of packages) {
          const packageType = this.determinePackageType(pkg.id, pkg.name);
          
          await connection.execute(`
            INSERT INTO iptv_packages (package_id, name, connections, duration, credits, package_type, synced_at)
            VALUES (?, ?, ?, ?, ?, ?, NOW())
          `, [
            pkg.id,
            pkg.name || `Package ${pkg.id}`,
            pkg.connections || 1,
            pkg.duration || '1 month',
            pkg.credits || 1,
            packageType
          ]);
        }
        
         await this.updateSetting('iptv_last_sync', new Date().toISOString());
        console.log(`✅ Synced ${packages.length} packages from panel`);
        
        return packages.length;
      } finally {
        connection.release();
      }
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
      
      const connection = await db.getConnection();
      try {
        // Clear existing bouquets
        await connection.execute('DELETE FROM iptv_bouquets');
        
        // Insert new bouquets
        for (const bouquet of bouquets) {
          await connection.execute(`
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
      } finally {
        connection.release();
      }
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
      const connection = await db.getConnection();
      try {
        const [rows] = await connection.execute(
          'SELECT * FROM iptv_packages WHERE package_id = ? AND is_active = true',
          [packageId]
        );
        
        return (Array.isArray(rows) && rows.length > 0) ? rows[0] : null;
      } finally {
        connection.release();
      }
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
      const connection = await db.getConnection();
      try {
        await connection.execute(`
          INSERT INTO iptv_activity_log (user_id, line_id, action, package_id, credits_used, success, error_message, api_response, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
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
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('❌ Failed to log IPTV activity:', error);
    }
  }

  /**
   * Get available packages from database - FIXED VERSION
   */
  async getAvailablePackages() {
    try {
      const connection = await db.getConnection();
      try {
        const [rows] = await connection.execute(`
          SELECT * FROM iptv_packages 
          WHERE is_active = true 
          ORDER BY package_type, duration, connections
        `);
        
        if (!rows || !Array.isArray(rows)) {
          console.log('⚠️ No packages found in database');
          return [];
        }
        
        return rows;
      } finally {
        connection.release();
      }
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
      const connection = await db.getConnection();
      try {
        const [rows] = await connection.execute(`
          SELECT * FROM iptv_channel_groups 
          WHERE is_active = true 
          ORDER BY name
        `);
        
        if (!rows || !Array.isArray(rows)) {
          console.log('⚠️ No channel groups found in database');
          return [];
        }
        
        return rows;
      } finally {
        connection.release();
      }
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
      const connection = await db.getConnection();
      try {
        const [result] = await connection.execute(`
          INSERT INTO iptv_channel_groups (name, description, bouquet_ids, created_at)
          VALUES (?, ?, ?, NOW())
        `, [name, description, JSON.stringify(bouquetIds)]);
        
        const insertId = result.insertId;
        
        console.log(`✅ Created channel group: ${name}`);
        return insertId;
      } finally {
        connection.release();
      }
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
      const connection = await db.getConnection();
      try {
        await connection.execute(`
          UPDATE iptv_channel_groups 
          SET name = ?, description = ?, bouquet_ids = ?, updated_at = NOW()
          WHERE id = ?
        `, [name, description, JSON.stringify(bouquetIds), id]);
        
        console.log(`✅ Updated channel group: ${name}`);
        return true;
      } finally {
        connection.release();
      }
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
      const connection = await db.getConnection();
      try {
        // Set users using this group to NULL
        await connection.execute(
          'UPDATE users SET iptv_channel_group_id = NULL WHERE iptv_channel_group_id = ?',
          [id]
        );
        
        // Delete the group
        await connection.execute('DELETE FROM iptv_channel_groups WHERE id = ?', [id]);
        
        console.log(`✅ Deleted channel group: ${id}`);
        return true;
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error(`❌ Failed to delete channel group ${id}:`, error);
      throw error;
    }
  }

  /**
   * Generate stream URLs for user
   */
  generateStreamURLs(username, password) {
    if (!username || !password) {
      return {};
    }

    // Based on your screenshots, the base URL pattern is:
    const baseURL = 'https://Pinkpony.lol:443';
    return {
      m3u: `${baseURL}/get.php?username=${username}&password=${password}&type=m3u&output=ts`,
      m3u_plus: `${baseURL}/get.php?username=${username}&password=${password}&type=m3u_plus&output=ts`,
      xmltv: `${baseURL}/xmltv.php?username=${username}&password=${password}`,
      player_api: `${baseURL}/player_api.php?username=${username}&password=${password}`,
      portal: `${baseURL}/c`
    };
  }

  /**
   * Generate iMPlayer code for user
   */
  generateiMPlayerCode(username, password) {
    if (!username || !password) {
      return null;
    }

    // iMPlayer code format: server|username|password
    return `https://Pinkpony.lol:443|${username}|${password}`;
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

  /**
   * Get user IPTV details from database
   */
  async getUserIPTVDetails(userId) {
    const connection = await db.getConnection();
    try {
      const [rows] = await connection.execute(
        'SELECT iptv_line_id, iptv_username, iptv_password, iptv_package_id, iptv_package_name, ' +
        'iptv_expiration, iptv_credits_used, iptv_channel_group_id, iptv_connections, iptv_is_trial, implayer_code ' +
        'FROM users WHERE id = ?',
        [userId]
      );
      
      if (rows.length === 0) {
        return null;
      }
      
      const user = rows[0];
      
      // Generate stream URLs if user has credentials
      if (user.iptv_username && user.iptv_password) {
        user.stream_urls = this.generateStreamURLs(user.iptv_username, user.iptv_password);
        if (!user.implayer_code) {
          user.implayer_code = this.generateiMPlayerCode(user.iptv_username, user.iptv_password);
        }
      }
      
      return user;
    } finally {
      connection.release();
    }
  }

  /**
   * Update user IPTV details in database
   */
  async updateUserIPTVDetails(userId, iptvData) {
    const connection = await db.getConnection();
    try {
      const updateFields = [];
      const updateValues = [];
      
      // Build dynamic update query based on provided data
      Object.keys(iptvData).forEach(key => {
        if (iptvData[key] !== undefined) {
          updateFields.push(`${key} = ?`);
          updateValues.push(iptvData[key]);
        }
      });
      
      if (updateFields.length === 0) {
        return;
      }
      
      updateValues.push(userId);
      
      await connection.execute(
        `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );
      
      await this.logActivity(userId, null, 'update_user_iptv', null, 0, true, null, null);
    } finally {
      connection.release();
    }
  }

  /**
   * Clear user IPTV data
   */
  async clearUserIPTVData(userId) {
    const connection = await db.getConnection();
    try {
      await connection.execute(
        'UPDATE users SET iptv_line_id = NULL, iptv_username = NULL, iptv_password = NULL, ' +
        'iptv_package_id = NULL, iptv_package_name = NULL, iptv_expiration = NULL, ' +
        'iptv_credits_used = 0, iptv_channel_group_id = NULL, iptv_connections = NULL, ' +
        'iptv_is_trial = 0, implayer_code = NULL WHERE id = ?',
        [userId]
      );
      
      await this.logActivity(userId, null, 'clear_user_iptv', null, 0, true, null, null);
    } finally {
      connection.release();
    }
  }

  /**
   * Get activity logs
   */
  async getActivityLogs(limit = 100) {
    const connection = await db.getConnection();
    try {
      const [rows] = await connection.execute(
        'SELECT * FROM iptv_activity_log ORDER BY created_at DESC LIMIT ?',
        [limit]
      );
      return rows;
    } finally {
      connection.release();
    }
  }
}

// Export singleton instance
module.exports = new IPTVService();