// iptv-service.js - IPTV Panel API Integration Service - FIXED DATABASE VERSION
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
    try {
      const rows = await db.query(
        'SELECT setting_key, setting_value FROM settings WHERE setting_key LIKE "iptv_%"'
      );
      
      const settings = {};
      if (Array.isArray(rows)) {
        rows.forEach(row => {
          settings[row.setting_key] = row.setting_value;
        });
      }
      
      return settings;
    } catch (error) {
      console.error('❌ Error loading IPTV settings:', error);
      return {};
    }
  }

  /**
   * Get IPTV settings from database - FIXED VERSION
   */
  async getSettings() {
    try {
      const rows = await db.query(`
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
    } catch (error) {
      console.error('❌ Error getting IPTV settings:', error);
      return {};
    }
  }

  /**
   * DEBUG: Direct settings check - FIXED VERSION
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
   * Update setting in database - FIXED VERSION
   */
  async updateSetting(key, value) {
    try {
      await db.query(
        'INSERT INTO settings (setting_key, setting_value, setting_type) VALUES (?, ?, "string") ' +
        'ON DUPLICATE KEY UPDATE setting_value = ?',
        [key, value, value]
      );
    } catch (error) {
      console.error('❌ Error updating setting:', error);
      throw error;
    }
  }


/**
   * Check if we have valid authentication - RELAXED FOR BETTER SESSION REUSE
   */
  isAuthenticated() {
    // If we don't have basic auth components, definitely not authenticated
    if (!this.csrfToken || !this.sessionCookies) {
      console.log('🔍 Not authenticated: missing token or cookies');
      return false;
    }
    
    // If we have expiration time and it's passed, not authenticated
    if (this.csrfExpires && new Date() > this.csrfExpires) {
      console.log('🔍 Not authenticated: token expired');
      return false;
    }
    
    // If we don't have expiration time but have token/cookies, assume valid for 45 minutes
    if (!this.csrfExpires) {
      console.log('🔍 No expiration set, assuming session is valid');
      return true;
    }
    
    console.log('🔍 Session appears valid, reusing existing authentication');
    return true;
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
   * Login to IPTV panel - SET LONGER EXPIRATION
   */
  async loginToPanel() {
    try {
      console.log('🔐 Logging into IPTV panel...');
      
      // Step 1: Get CSRF token and initial cookies
      const csrfToken = await this.getCSRFToken();
      
      // Step 2: Login
      const loginResponse = await axios({
        method: 'POST',
        url: this.loginURL,
        data: new URLSearchParams({
          '_token': csrfToken,
          'username': this.username,
          'password': this.password
        }),
        timeout: 15000,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-CSRF-TOKEN': csrfToken,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Referer': this.loginURL,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Cookie': this.sessionCookies || ''
        },
        maxRedirects: 5,
        validateStatus: (status) => status >= 200 && status < 400
      });

      console.log('✅ Login successful! Status:', loginResponse.status);

      // Step 3: Extract cookies and get fresh CSRF from dashboard
      const setCookieHeaders = loginResponse.headers['set-cookie'] || [];
      let cookieParts = [];
      
      setCookieHeaders.forEach(cookie => {
        const cookiePart = cookie.split(';')[0];
        cookieParts.push(cookiePart);
      });
      
      this.sessionCookies = cookieParts.join('; ');
      
      // Step 4: Get fresh CSRF token from dashboard
      console.log('🔄 Getting fresh CSRF token from dashboard...');
      const dashboardResponse = await axios({
        method: 'GET',
        url: this.loginURL,
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Cookie': this.sessionCookies,
          'Referer': this.loginURL
        }
      });

      const freshCsrfMatch = dashboardResponse.data.match(/name="?csrf-token"?\s+content="([^"]+)"/);
      const freshMetaCsrfMatch = dashboardResponse.data.match(/name="?_token"?\s+value="([^"]+)"/);
      
      this.csrfToken = freshCsrfMatch ? freshCsrfMatch[1] : (freshMetaCsrfMatch ? freshMetaCsrfMatch[1] : csrfToken);
      
      // Set expiration for 45 minutes (be more generous)
      this.csrfExpires = new Date(Date.now() + (45 * 60 * 1000));
      
      // Save to database
      await this.updateSetting('iptv_csrf_token', this.csrfToken);
      await this.updateSetting('iptv_session_cookies', this.sessionCookies);
      await this.updateSetting('iptv_csrf_expires', this.csrfExpires.toISOString());
      
      console.log('🍪 Updated session cookies:', this.sessionCookies.substring(0, 100) + '...');
      console.log('🔑 Using CSRF token:', this.csrfToken.substring(0, 20) + '...');
      
      console.log('✅ Successfully logged into IPTV panel');
      return true;
      
    } catch (error) {
      console.error('❌ Login failed:', error.message);
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
   * Make authenticated API request - ENHANCED CSRF HANDLING
   */
  async makeAPIRequest(endpoint, data = {}, method = 'POST') {
    // ALWAYS get fresh authentication for API calls
    console.log(`🔄 Making API request to ${endpoint} - getting fresh auth...`);
    await this.loginToPanel();

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
          'Cookie': this.sessionCookies || '',
          'Referer': this.loginURL  // Add referer header
        }
      });

      console.log(`✅ API request to ${endpoint} successful`);
      return response.data;
    } catch (error) {
      console.error(`❌ API request failed for ${endpoint}:`, error.message);
      console.error(`🔍 Response status:`, error.response?.status);
      console.error(`🔍 Response data:`, error.response?.data);
      
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
   * Get packages from IPTV panel - BETTER SESSION REUSE
   */
  async getPackagesFromPanel() {
    try {
      console.log('📦 Getting packages from panel...');
      
      // Only login if we absolutely need to
      if (!this.isAuthenticated()) {
        console.log('🔄 No valid session, logging in...');
        await this.loginToPanel();
      } else {
        console.log('✅ Using existing valid session');
      }
      
      // Make the request
      const response = await axios({
        method: 'GET',
        url: `${this.baseURL}/lines/create/0/line`,
        timeout: 15000,
        headers: {
          'User-Agent': 'PostmanRuntime/7.44.1',
          'Accept': '*/*',
          'Cache-Control': 'no-cache',
          'Host': 'panel.pinkpony.lol',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Cookie': this.sessionCookies
        }
      });
      
      const htmlContent = response.data;
      console.log('📄 Got HTML response, length:', htmlContent.length);
      
      // If we got redirected AND the content is short, session expired
      if (htmlContent.includes('login') && htmlContent.includes('username') && htmlContent.length < 50000) {
        console.log('⚠️ Got redirected to login page, session expired');
        
        // Clear session and try ONE more time
        this.csrfToken = null;
        this.sessionCookies = null;
        this.csrfExpires = null;
        
        console.log('🔄 Retrying with fresh login...');
        await this.loginToPanel();
        
        // Retry the request
        const retryResponse = await axios({
          method: 'GET',
          url: `${this.baseURL}/lines/create/0/line`,
          timeout: 15000,
          headers: {
            'User-Agent': 'PostmanRuntime/7.44.1',
            'Accept': '*/*',
            'Cache-Control': 'no-cache',
            'Host': 'panel.pinkpony.lol',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Cookie': this.sessionCookies
          }
        });
        
        return this.parsePackageOptions(retryResponse.data);
      }
      
      return this.parsePackageOptions(htmlContent);
      
    } catch (error) {
      console.error('❌ Failed to get packages:', error);
      throw new Error(`Failed to get packages: ${error.message}`);
    }
  }

  /**
   * Parse package options from select HTML content
   */
  parsePackageOptions(selectContent) {
    console.log('🔍 Parsing package options...');
    
    const packages = [];
    
    // Updated regex to handle the exact format from your HTML
    const optionRegex = /<option\s+value="(\d+)"\s+data-credits="(\d+)"\s+data-duration="(\d+)"\s+data-duration-in="([^"]+)"\s+data-connections="(\d+)"[^>]*>\s*([^<]+?)\s*<\/option>/gi;
    
    let match;
    let matchCount = 0;
    
    while ((match = optionRegex.exec(selectContent)) !== null) {
      matchCount++;
      const [, id, credits, duration, durationUnit, connections, description] = match;
      
      console.log(`🔍 Found package: ID=${id}, Credits=${credits}, Duration=${duration} ${durationUnit}, Connections=${connections}`);
      
      // Skip empty options or "Select one please" 
      if (id && id !== '' && !description.includes('Select one please')) {
        // Clean up description and extract package name
        const fullDescription = description.trim();
        
        // Extract package type/name (everything before the first " - ")
        const nameMatch = fullDescription.match(/^([^-]+?)(?:\s*-|$)/);
        let packageName = nameMatch ? nameMatch[1].trim() : fullDescription;
        
        // Determine package type based on description
        let packageType = 'basic';
        if (fullDescription.toUpperCase().includes('LIVE TV ONLY')) {
          packageType = 'live_tv_only';
          packageName = 'Live TV Only';
        } else if (fullDescription.toUpperCase().includes('USA, CAN, UK, LAT, SPORTS')) {
          packageType = 'full_service';  
          packageName = 'Full Service';
        } else if (fullDescription.includes('Con.') && fullDescription.includes('month')) {
          packageType = 'basic';
          packageName = 'Basic Package';
        }
        
        packages.push({
          id: id,
          name: packageName,
          connections: parseInt(connections),
          duration_months: parseInt(duration),
          duration_unit: durationUnit,
          credits: parseInt(credits),
          description: fullDescription,
          package_type: packageType
        });
      }
    }
    
    console.log(`🔍 Regex found ${matchCount} option elements, extracted ${packages.length} valid packages`);
    
    // If no matches, try a more flexible regex
    if (packages.length === 0) {
      console.log('🔄 Trying more flexible parsing...');
      
      // Try to match any option with data attributes, being more flexible with whitespace and quotes
      const flexibleRegex = /<option[^>]*value=["']?(\d+)["']?[^>]*data-credits=["']?(\d+)["']?[^>]*data-duration=["']?(\d+)["']?[^>]*data-duration-in=["']?([^"'\s>]+)["']?[^>]*data-connections=["']?(\d+)["']?[^>]*>\s*([^<]+?)\s*<\/option>/gi;
      
      let flexMatch;
      while ((flexMatch = flexibleRegex.exec(selectContent)) !== null) {
        const [, id, credits, duration, durationUnit, connections, description] = flexMatch;
        
        if (id && !description.includes('Select one please')) {
          console.log(`🔍 Flexible match: ID=${id}, Credits=${credits}`);
          
          packages.push({
            id: id,
            name: description.trim().split(' - ')[0] || 'Package',
            connections: parseInt(connections),
            duration_months: parseInt(duration), 
            duration_unit: durationUnit,
            credits: parseInt(credits),
            description: description.trim(),
            package_type: 'basic'
          });
        }
      }
    }
    
    console.log(`✅ Successfully parsed ${packages.length} packages from panel`);
    return packages;
  }

 /**
   * Get bouquets from IPTV panel - FIXED CSRF AND SESSION HANDLING
   */
  async getBouquetsFromPanel(packageId = null) {
    try {
      console.log('📺 Getting bouquets (channel groups) from panel...');
      
      // Use the package ID from settings
      const pkgId = packageId || this.packageIdForBouquets || '175';
      
      // Ensure fresh login and session
      await this.loginToPanel();
      
      // Add delay to ensure session is ready
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Make the API request with improved headers and error handling
      const response = await axios({
        method: 'POST',
        url: `${this.baseURL}/lines/packages`,
        data: new URLSearchParams({
          '_token': this.csrfToken,
          'package_id': pkgId,
          'trial': '0'
        }),
        timeout: 15000,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-CSRF-TOKEN': this.csrfToken,
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Origin': this.baseURL,
          'Referer': this.baseURL + '/lines/create/0/line',  // Use the form page as referer
          'Cookie': this.sessionCookies,
          'Connection': 'keep-alive',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin'
        }
      });
      
      console.log('🔍 Bouquets response status:', response.status);
      console.log('🔍 Bouquets response data:', response.data);
      
      if (response.data && response.data.bouquets) {
        // Convert to our format
        const bouquets = response.data.bouquets.map(bouquet => ({
          id: bouquet.id.toString(),
          name: bouquet.bouquet_name,
          category: this.categorizeBouquet(bouquet.bouquet_name)
        }));
        
        console.log(`✅ Found ${bouquets.length} bouquets`);
        return bouquets;
      }
      
      console.warn('⚠️ Unexpected bouquets response format:', response.data);
      return [];
      
    } catch (error) {
      console.error('❌ Failed to get bouquets:', error.message);
      
      // If it's a CSRF error, try one more time with fresh login
      if (error.response && error.response.status === 419) {
        console.log('🔄 CSRF error, attempting fresh login and retry...');
        try {
          // Force fresh login
          this.csrfToken = null;
          this.sessionCookies = null;
          await this.loginToPanel();
          
          // Wait a bit longer before retry
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const retryResponse = await axios({
            method: 'POST',
            url: `${this.baseURL}/lines/packages`,
            data: new URLSearchParams({
              '_token': this.csrfToken,
              'package_id': packageId || this.packageIdForBouquets || '175',
              'trial': '0'
            }),
            timeout: 15000,
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'X-CSRF-TOKEN': this.csrfToken,
              'X-Requested-With': 'XMLHttpRequest',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/json, text/javascript, */*; q=0.01',
              'Origin': this.baseURL,
              'Referer': this.baseURL + '/lines/create/0/line',
              'Cookie': this.sessionCookies
            }
          });
          
          if (retryResponse.data && retryResponse.data.bouquets) {
            const bouquets = retryResponse.data.bouquets.map(bouquet => ({
              id: bouquet.id.toString(),
              name: bouquet.bouquet_name,
              category: this.categorizeBouquet(bouquet.bouquet_name)
            }));
            
            console.log(`✅ Retry successful! Found ${bouquets.length} bouquets`);
            return bouquets;
          }
        } catch (retryError) {
          console.error('❌ Retry also failed:', retryError.message);
        }
      }
      
      throw new Error(`Failed to get bouquets: ${error.message}`);
    }
  }
  
    /**
   * Categorize bouquet based on name
   */
  categorizeBouquet(name) {
    const lowerName = name.toLowerCase();
    
    if (lowerName.includes('sport') || lowerName.includes('nba') || lowerName.includes('nfl') || lowerName.includes('mlb') || lowerName.includes('nhl')) {
      return 'Sports';
    } else if (lowerName.includes('movie') || lowerName.includes('cinema') || lowerName.includes('24/7')) {
      return 'Entertainment';
    } else if (lowerName.includes('news') || lowerName.includes('noticias')) {
      return 'News';
    } else if (lowerName.includes('kids') || lowerName.includes('infantil')) {
      return 'Kids';
    } else if (lowerName.includes('adult')) {
      return 'Adult';
    } else if (lowerName.includes('usa') || lowerName.includes('canada') || lowerName.includes('uk')) {
      return 'Regional';
    } else {
      return 'General';
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
 * REPLACE this method in your existing iptv-service.js file
 */
async syncCreditsFromPanel() {
  try {
    console.log('🔄 Syncing credit balance from panel...');
    
    // Check current authentication status
    console.log('🔍 Current authentication status:');
    console.log('  - CSRF Token:', this.csrfToken ? 'Present' : 'Missing');
    console.log('  - Session Cookies:', this.sessionCookies ? 'Present' : 'Missing');
    console.log('  - CSRF Expires:', this.csrfExpires);
    console.log('  - Is Authenticated:', this.isAuthenticated());
    
    // Force fresh login for now to test
    console.log('🔄 Forcing fresh login to test...');
    await this.loginToPanel();
    
    // Try to get the cookies directly from the last successful response
    // Sometimes the cookies get updated during the login flow
    console.log('🔍 Checking if we need to use updated cookies...');
    
    // Debug logging after authentication
    console.log('🔍 After fresh login:');
    console.log('🔍 Base URL:', this.baseURL);
    console.log('🔍 Session cookies:', this.sessionCookies?.substring(0, 100) + '...');
    console.log('🔍 CSRF token:', this.csrfToken?.substring(0, 20) + '...');
    
    // Try a small delay before the request
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // GET the credits page with our session
    console.log('🔄 Getting credits from /rlogs/credits...');
    console.log('🔍 Making request to:', `${this.baseURL}/rlogs/credits`);
    console.log('🔍 Using cookies:', this.sessionCookies);
    
    const response = await axios.get(`${this.baseURL}/rlogs/credits`, {
      timeout: 15000,
      headers: {
        'User-Agent': 'PostmanRuntime/7.44.1',
        'Accept': '*/*',
        'Cache-Control': 'no-cache',
        'Cookie': this.sessionCookies,
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive'
      }
    });

    const htmlContent = response.data;
    let credits = 0;
    
    console.log('📊 Credits Response Status:', response.status);
    console.log('📊 Response Headers:', response.headers);
    console.log('📊 HTML Length:', htmlContent.length);
    console.log('📊 Complete HTML Response:', htmlContent);
    
    if (htmlContent === 'no access.' || htmlContent.includes('no access')) {
      console.log('❌ Authentication failed - got "no access" response');
      console.log('🔍 Request details that failed:');
      console.log('  - URL:', `${this.baseURL}/rlogs/credits`);
      console.log('  - Cookie header:', this.sessionCookies);
      console.log('  - Cookie length:', this.sessionCookies?.length);
      return 0;
    }
    
    // Parse credits: <div class="label label-warning">Credits: 58</div>
    const creditMatch = htmlContent.match(/label-warning[^>]*>\s*Credits:\s*(\d+)/i);
    
    if (creditMatch && creditMatch[1]) {
      credits = parseInt(creditMatch[1], 10);
      console.log(`✅ Found credits: ${credits}`);
    } else {
      console.log('⚠️ Could not find credits in HTML');
      
      // Debug: show any mention of "credit"
      if (htmlContent.toLowerCase().includes('credit')) {
        const creditIndex = htmlContent.toLowerCase().indexOf('credit');
        const start = Math.max(0, creditIndex - 50);
        const end = Math.min(htmlContent.length, creditIndex + 100);
        console.log('📝 Credit context:', htmlContent.substring(start, end));
      } else {
        console.log('🔍 No "credit" found in HTML');
        if (htmlContent.includes('no access')) {
          console.log('⚠️ Got "no access" - authentication may have failed');
        }
      }
    }

    // Update local storage
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
   * Sync packages from panel to database - CORRECTED
   */
  async syncPackagesFromPanel() {
    try {
      console.log('📦 Syncing packages (subscription plans) from panel...');
      
      // Login fresh for this operation
      await this.loginToPanel();
      
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
          pkg.name,
          pkg.connections,
          pkg.duration_months,
          pkg.credits,
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
   * Sync bouquets from panel to database - FIXED INSERTION
   */
  async syncBouquetsFromPanel() {
    try {
      console.log('📺 Syncing bouquets (channel groups) from panel...');
      
      const bouquets = await this.getBouquetsFromPanel();
      console.log(`🔍 Got ${bouquets.length} bouquets from panel, starting database insertion...`);
      
      let insertedCount = 0;
      
      // Insert/update bouquets one by one
      for (const bouquet of bouquets) {
        try {
          // Use INSERT ... ON DUPLICATE KEY UPDATE pattern
          await db.query(`
            INSERT INTO iptv_bouquets (bouquet_id, name, category, synced_at)
            VALUES (?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE 
              name = VALUES(name),
              category = VALUES(category),
              synced_at = NOW(),
              is_active = true
          `, [
            bouquet.id,
            bouquet.name,
            bouquet.category || 'General'
          ]);
          
          insertedCount++;
          
          if (insertedCount % 20 === 0) {
            console.log(`🔄 Inserted ${insertedCount}/${bouquets.length} bouquets...`);
          }
        } catch (insertError) {
          console.error(`❌ Failed to insert bouquet ${bouquet.id}:`, insertError);
          // Continue with other bouquets
        }
      }
      
      console.log(`✅ Successfully synced ${insertedCount} bouquets from panel`);
      
      // Verify insertion by counting
      const countResult = await db.query('SELECT COUNT(*) as total FROM iptv_bouquets WHERE is_active = true');
      const totalInDB = Array.isArray(countResult) ? countResult[0].total : countResult.total;
      console.log(`🔍 Database now contains ${totalInDB} active bouquets`);
      
      return insertedCount;
    } catch (error) {
      console.error('❌ Failed to sync bouquets:', error);
      throw new Error(`Failed to sync bouquets: ${error.message}`);
    }
  }

  /**
   * Get package info from local database - FIXED VERSION
   */
  async getPackageInfo(packageId) {
    try {
      const rows = await db.query(
        'SELECT * FROM iptv_packages WHERE package_id = ? AND is_active = true',
        [packageId]
      );
      
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
   * Log IPTV activity - FIXED VERSION
   */
  async logActivity(userId, lineId, action, packageId, creditsUsed, success, errorMessage, apiResponse) {
    try {
      await db.query(`
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
    } catch (error) {
      console.error('❌ Failed to log IPTV activity:', error);
    }
  }

  /**
   * Get available packages from database - FIXED VERSION
   */
  async getAvailablePackages() {
    try {
      const rows = await db.query(`
        SELECT * FROM iptv_packages 
        WHERE is_active = true 
        ORDER BY package_type, duration_months, connections
      `);
      
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
      const rows = await db.query(`
        SELECT * FROM iptv_channel_groups 
        WHERE is_active = true 
        ORDER BY name
      `);
      
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
   * Create new channel group - FIXED VERSION
   */
  async createChannelGroup(name, description, bouquetIds) {
    try {
      const result = await db.query(`
        INSERT INTO iptv_channel_groups (name, description, bouquet_ids, created_at)
        VALUES (?, ?, ?, NOW())
      `, [name, description, JSON.stringify(bouquetIds)]);
      
      const insertId = result.insertId;
      
      console.log(`✅ Created channel group: ${name}`);
      return insertId;
    } catch (error) {
      console.error(`❌ Failed to create channel group ${name}:`, error);
      throw error;
    }
  }

  /**
   * Update channel group - FIXED VERSION
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
   * Delete channel group - FIXED VERSION
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
   * Get user IPTV details from database - FIXED VERSION
   */
  async getUserIPTVDetails(userId) {
    try {
      const rows = await db.query(
        'SELECT iptv_line_id, iptv_username, iptv_password, iptv_package_id, iptv_package_name, ' +
        'iptv_expiration, iptv_credits_used, iptv_channel_group_id, iptv_connections, iptv_is_trial, implayer_code ' +
        'FROM users WHERE id = ?',
        [userId]
      );
      
      if (!rows || !Array.isArray(rows) || rows.length === 0) {
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
    } catch (error) {
      console.error('❌ Failed to get user IPTV details:', error);
      return null;
    }
  }

  /**
   * Update user IPTV details in database - FIXED VERSION
   */
  async updateUserIPTVDetails(userId, iptvData) {
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
      
      await db.query(
        `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );
      
      await this.logActivity(userId, null, 'update_user_iptv', null, 0, true, null, null);
    } catch (error) {
      console.error('❌ Failed to update user IPTV details:', error);
      throw error;
    }
  }

  /**
   * Clear user IPTV data - FIXED VERSION
   */
  async clearUserIPTVData(userId) {
    try {
      await db.query(
        'UPDATE users SET iptv_line_id = NULL, iptv_username = NULL, iptv_password = NULL, ' +
        'iptv_package_id = NULL, iptv_package_name = NULL, iptv_expiration = NULL, ' +
        'iptv_credits_used = 0, iptv_channel_group_id = NULL, iptv_connections = NULL, ' +
        'iptv_is_trial = 0, implayer_code = NULL WHERE id = ?',
        [userId]
      );
      
      await this.logActivity(userId, null, 'clear_user_iptv', null, 0, true, null, null);
    } catch (error) {
      console.error('❌ Failed to clear user IPTV data:', error);
      throw error;
    }
  }

  /**
   * Get activity logs - FIXED VERSION
   */
  async getActivityLogs(limit = 100) {
    try {
      const rows = await db.query(
        'SELECT * FROM iptv_activity_log ORDER BY created_at DESC LIMIT ?',
        [limit]
      );
      return rows || [];
    } catch (error) {
      console.error('❌ Failed to get activity logs:', error);
      return [];
    }
  }
}

// Export singleton instance
module.exports = new IPTVService();