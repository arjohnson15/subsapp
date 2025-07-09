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
   * Load IPTV settings from database
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
   * Get IPTV settings from database
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
      
      return settings;
    } catch (error) {
      console.error('❌ Error getting IPTV settings:', error);
      return {};
    }
  }

  /**
   * Update setting in database
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
   * CRITICAL: Update session cookies from API response
   * This panel regenerates cookies on EVERY request
   * BUT WE SHOULD NOT USE THIS FOR PACKAGES/BOUQUETS - IT BREAKS SESSIONS
   */
  updateSessionCookies(response) {
    const setCookieHeaders = response.headers['set-cookie'];
    if (setCookieHeaders && setCookieHeaders.length > 0) {
      this.sessionCookies = setCookieHeaders.map(cookie => 
        cookie.split(';')[0]
      ).join('; ');
      
      console.log('🍪 Updated session cookies from API response - THIS MAY BREAK SESSION!');
      console.log('🔍 New cookies:', this.sessionCookies.substring(0, 100) + '...');
      
      // Save to database (async, don't wait)
      this.updateSetting('iptv_session_cookies', this.sessionCookies).catch(error => {
        console.error('⚠️ Failed to save updated cookies to database:', error);
      });
    }
  }

  /**
   * Check if we have valid authentication
   */
  isAuthenticated() {
    if (!this.csrfToken || !this.sessionCookies) {
      return false;
    }
    
    if (this.csrfExpires && new Date() > this.csrfExpires) {
      return false;
    }
    
    return true;
  }

  /**
   * Get CSRF token from login page with proper cookie handling
   */
  async getCSRFToken() {
    try {
      console.log('🔑 Getting CSRF token from:', this.loginURL);
      
      const response = await axios.get(this.loginURL, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive'
        }
      });

      // CRITICAL: Update cookies from initial request
      this.updateSessionCookies(response);

      const responseText = response.data;
      console.log('🔍 Login page response length:', responseText.length);
      
      // Extract CSRF token using multiple patterns
      let csrfToken = null;
      
      // Pattern 1: name="_token" value="TOKEN"
      const tokenMatch = responseText.match(/name=["\']_token["\'][^>]*value=["\']([^"\']+)["\']/);
      if (tokenMatch) {
        csrfToken = tokenMatch[1];
        console.log("✅ CSRF Token found via _token pattern:", csrfToken.substring(0, 20) + '...');
      }
      
      // Pattern 2: name="csrf-token" content="TOKEN"
      if (!csrfToken) {
        const metaMatch = responseText.match(/name=["\']csrf-token["\'][^>]*content=["\']([^"\']+)["\']/);
        if (metaMatch) {
          csrfToken = metaMatch[1];
          console.log("✅ CSRF Token found via meta pattern:", csrfToken.substring(0, 20) + '...');
        }
      }
      
      if (!csrfToken) {
        throw new Error('CSRF token not found in login page');
      }
      
      return csrfToken;
    } catch (error) {
      console.error('❌ Failed to get CSRF token:', error.message);
      throw new Error(`Failed to get CSRF token: ${error.message}`);
    }
  }

  /**
   * Login to IPTV panel with proper 3-step authentication
   */
  async loginToPanel() {
    try {
      console.log('🔐 Logging into IPTV panel...');
      
      // Step 1: Get login page and extract CSRF token
      console.log('🔑 Getting CSRF token from:', this.loginURL);
      const loginPageResponse = await axios({
        method: 'GET',
        url: this.loginURL,
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive'
        }
      });

      // Extract CSRF token from form
      const csrfMatch = loginPageResponse.data.match(/name="?_token"?\s+value="([^"]+)"/);
      const metaCsrfMatch = loginPageResponse.data.match(/name="csrf-token"\s+content="([^"]+)"/);
      
      if (!csrfMatch && !metaCsrfMatch) {
        throw new Error('Could not find CSRF token in login page');
      }
      
      const csrfToken = csrfMatch ? csrfMatch[1] : metaCsrfMatch[1];
      console.log('✅ CSRF Token found:', csrfToken.substring(0, 20) + '...');
      
      // Extract and store initial session cookies (ONLY relevant ones)
      const setCookieHeaders = loginPageResponse.headers['set-cookie'] || [];
      let sessionCookies = '';
      
      setCookieHeaders.forEach(cookie => {
        const cookiePart = cookie.split(';')[0];
        if (cookiePart.includes('XSRF-TOKEN') || cookiePart.includes('management_session')) {
          sessionCookies += cookiePart + '; ';
        }
      });
      
      console.log('🍪 Captured initial session cookies:', sessionCookies.substring(0, 50) + '...');

      // Step 2: Perform login with credentials
      console.log('📤 Posting login with credentials...');
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
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': this.loginURL,
          'Origin': this.baseURL,
          'Connection': 'keep-alive',
          'Cookie': sessionCookies
        },
        maxRedirects: 5,
        validateStatus: function (status) {
          return status >= 200 && status < 400;
        }
      });

      console.log('✅ Login successful! Status:', loginResponse.status);

      // Step 3: Extract updated session cookies from login response
      const loginSetCookieHeaders = loginResponse.headers['set-cookie'] || [];
      let updatedSessionCookies = sessionCookies;
      
      loginSetCookieHeaders.forEach(cookie => {
        const cookiePart = cookie.split(';')[0];
        if (cookiePart.includes('XSRF-TOKEN')) {
          // Replace XSRF-TOKEN
          updatedSessionCookies = updatedSessionCookies.replace(/XSRF-TOKEN=[^;]*;?\s*/, '');
          updatedSessionCookies += cookiePart + '; ';
        } else if (cookiePart.includes('management_session')) {
          // Replace management_session
          updatedSessionCookies = updatedSessionCookies.replace(/management_session=[^;]*;?\s*/, '');
          updatedSessionCookies += cookiePart + '; ';
        }
      });

      // Step 4: Get fresh CSRF token from dashboard (CRITICAL STEP!)
      console.log('🔄 Getting fresh CSRF token from dashboard...');
      const dashboardResponse = await axios({
        method: 'GET',
        url: this.baseURL + '/dashboard',
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Cookie': updatedSessionCookies,
          'Referer': this.loginURL
        }
      });

      // Extract fresh CSRF token for API calls
      const freshCsrfMatch = dashboardResponse.data.match(/name="?csrf-token"?\s+content="([^"]+)"/);
      const freshMetaCsrfMatch = dashboardResponse.data.match(/name="?_token"?\s+value="([^"]+)"/);
      
      const freshCsrfToken = freshCsrfMatch ? freshCsrfMatch[1] : (freshMetaCsrfMatch ? freshMetaCsrfMatch[1] : csrfToken);
      
      // Store the tokens and cookies
      this.csrfToken = freshCsrfToken;
      this.sessionCookies = updatedSessionCookies.trim();
      this.csrfExpires = new Date(Date.now() + (30 * 60 * 1000)); // 30 minutes
      
      // Save to database
      await this.updateSetting('iptv_csrf_token', this.csrfToken);
      await this.updateSetting('iptv_session_cookies', this.sessionCookies);
      await this.updateSetting('iptv_csrf_expires', this.csrfExpires.toISOString());
      
      console.log('🔐 Updated session cookies:', this.sessionCookies.substring(0, 50) + '...');
      console.log('🔑 Using fresh CSRF token:', this.csrfToken.substring(0, 20) + '...');
      
      console.log('✅ Successfully logged into IPTV panel');
      return true;
      
    } catch (error) {
      console.error('❌ Failed to login to IPTV panel:', error.message);
      throw new Error(`Login failed: ${error.message}`);
    }
  }

  /**
   * Ensure we have valid authentication
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
   * Make authenticated API request with proper session cookie management
   */
  async makeAPIRequest(endpoint, data = {}, method = 'POST') {
    console.log(`🔄 Making API request to ${endpoint}`);
    
    // Ensure fresh authentication
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
          'Cookie': this.sessionCookies || '',
          'Referer': `${this.baseURL}/lines/create/0/line`
        }
      });

      // CRITICAL: Update session cookies from every API response
      this.updateSessionCookies(response);

      console.log(`✅ API request to ${endpoint} successful`);
      return response.data;
    } catch (error) {
      console.error(`❌ API request failed for ${endpoint}:`, error.message);
      if (error.response) {
        console.error(`🔍 Response status:`, error.response.status);
        console.error(`🔍 Response data:`, error.response.data);
      }
      
      throw error;
    }
  }

  /**
   * Get packages from panel with session management
   */
  async getPackagesFromPanel() {
    try {
      console.log('📦 Getting packages from panel...');
      
      // Force fresh login instead of trusting existing auth
      console.log('🔄 Forcing fresh authentication for packages...');
      await this.loginToPanel();
      
      const createUrl = `${this.baseURL}/lines/create/0/line`;
      console.log('🔍 Fetching packages from:', createUrl);
      
      const response = await axios({
        method: 'GET',
        url: createUrl,
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cookie': this.sessionCookies,
          'Referer': this.baseURL
        }
      });
      
      // CRITICAL: Update cookies from response
      this.updateSessionCookies(response);
      
      console.log('📄 Package form response status:', response.status);
      console.log('📄 Package form response length:', response.data.length);
      
      // Check for "no access" response
      if (response.data === 'no access.' || response.data.includes('no access')) {
        console.log('❌ Got "no access" response - authentication failed');
        console.log('🔍 Current CSRF token:', this.csrfToken?.substring(0, 20) + '...');
        console.log('🔍 Current cookies:', this.sessionCookies?.substring(0, 100) + '...');
        throw new Error('Authentication failed: Got "no access" response from panel');
      }
      
      // 🔥 LOG THE ENTIRE RESPONSE FOR DEBUGGING (only if it's real content)
      if (response.data.length > 100) {
        console.log('🔥 === COMPLETE PACKAGES HTML RESPONSE ===');
        console.log(response.data);
        console.log('🔥 === END OF COMPLETE PACKAGES HTML RESPONSE ===');
      }
      
      return this.parsePackageOptions(response.data);
      
    } catch (error) {
      console.error('❌ Failed to get packages:', error.message);
      throw new Error(`Failed to get packages: ${error.message}`);
    }
  }

  /**
   * Parse package options from HTML
   */
  parsePackageOptions(htmlContent) {
    console.log('🔍 Parsing package options from HTML...');
    console.log('🔍 HTML content length:', htmlContent.length);
    
    const packages = [];
    
    // Multiple regex patterns to handle different HTML structures
    const patterns = [
      // Pattern 1: Standard data attributes with quotes
      /<option[^>]*value=["\'](\d+)["\'][^>]*data-credits=["\'](\d+)["\'][^>]*data-duration=["\'](\d+)["\'][^>]*data-duration-in=["\']([^"\']+)["\'][^>]*data-connections=["\'](\d+)["\'][^>]*>([^<]+)<\/option>/gi,
      
      // Pattern 2: No quotes around attribute values
      /<option[^>]*value=(\d+)[^>]*data-credits=(\d+)[^>]*data-duration=(\d+)[^>]*data-duration-in=([^\s>]+)[^>]*data-connections=(\d+)[^>]*>([^<]+)<\/option>/gi,
      
      // Pattern 3: Attributes in different order
      /<option[^>]*data-credits=["\'](\d+)["\'][^>]*value=["\'](\d+)["\'][^>]*data-duration=["\'](\d+)["\'][^>]*data-duration-in=["\']([^"\']+)["\'][^>]*data-connections=["\'](\d+)["\'][^>]*>([^<]+)<\/option>/gi
    ];
    
    // Debug: Show a sample of the HTML
    const sampleStart = htmlContent.indexOf('<option');
    if (sampleStart > -1) {
      const sampleEnd = htmlContent.indexOf('</select>', sampleStart);
      const sample = htmlContent.substring(sampleStart, sampleEnd > -1 ? sampleEnd : sampleStart + 1000);
      console.log('🔍 HTML sample around options:', sample.substring(0, 500));
    }
    
    // Try each pattern
    for (let i = 0; i < patterns.length; i++) {
      console.log(`🔍 Trying pattern ${i + 1}...`);
      const pattern = patterns[i];
      pattern.lastIndex = 0; // Reset regex
      
      let match;
      let matches = 0;
      
      while ((match = pattern.exec(htmlContent)) !== null) {
        matches++;
        let id, credits, duration, durationUnit, connections, description;
        
        if (i === 2) {
          // Pattern 3 has different order (credits first)
          [, credits, id, duration, durationUnit, connections, description] = match;
        } else {
          [, id, credits, duration, durationUnit, connections, description] = match;
        }
        
        // Skip empty options or placeholder text
        if (id && !description.toLowerCase().includes('select') && !description.toLowerCase().includes('please')) {
          const cleanDescription = description.trim();
          
          console.log(`🔍 Found package: ID=${id}, Credits=${credits}, Duration=${duration} ${durationUnit}, Connections=${connections}`);
          
          packages.push({
            id: id,
            name: this.extractPackageName(cleanDescription),
            connections: parseInt(connections),
            duration_months: this.convertDurationToMonths(parseInt(duration), durationUnit),
            duration_unit: durationUnit,
            credits: parseInt(credits),
            description: cleanDescription,
            package_type: this.determinePackageType(id, cleanDescription)
          });
        }
      }
      
      console.log(`🔍 Pattern ${i + 1} found ${matches} matches, extracted ${packages.length} packages`);
      
      if (packages.length > 0) {
        break; // Found packages, no need to try other patterns
      }
    }
    
    // If still no packages found, try a more basic extraction
    if (packages.length === 0) {
      console.log('🔄 No packages found with complex patterns, trying basic option search...');
      
      const basicPattern = /<option[^>]*value=["\'](\d+)["\'][^>]*>([^<]+)<\/option>/gi;
      let basicMatch;
      let basicCount = 0;
      
      while ((basicMatch = basicPattern.exec(htmlContent)) !== null) {
        const [, id, description] = basicMatch;
        basicCount++;
        
        if (id && !description.toLowerCase().includes('select') && !description.toLowerCase().includes('please')) {
          console.log(`🔍 Basic match: ID=${id}, Description=${description.trim()}`);
        }
      }
      
      console.log(`🔍 Found ${basicCount} basic option tags`);
    }
    
    console.log(`✅ Successfully parsed ${packages.length} packages from panel`);
    return packages;
  }

  /**
   * Extract package name from description
   */
  extractPackageName(description) {
    const nameMatch = description.match(/^([^-]+?)(?:\s*-|$)/);
    let packageName = nameMatch ? nameMatch[1].trim() : description;
    
    if (description.toUpperCase().includes('LIVE TV ONLY')) {
      packageName = 'Live TV Only';
    } else if (description.toUpperCase().includes('USA, CAN, UK, LAT, SPORTS')) {
      packageName = 'Full Service';
    } else if (description.includes('Con.') && description.includes('month')) {
      packageName = 'Basic Package';
    }
    
    return packageName;
  }

  /**
   * Convert duration to months
   */
  convertDurationToMonths(duration, unit) {
    const lowerUnit = unit.toLowerCase();
    
    if (lowerUnit.includes('month')) {
      return duration;
    } else if (lowerUnit.includes('year')) {
      return duration * 12;
    } else if (lowerUnit.includes('day')) {
      return Math.ceil(duration / 30);
    }
    
    return duration;
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
   * Process bouquet response data
   */
  processBouquetResponse(bouquets) {
    console.log(`🔍 Processing ${bouquets.length} bouquets...`);
    
    return bouquets.map(bouquet => ({
      id: bouquet.id.toString(),
      name: bouquet.bouquet_name,
      category: this.categorizeBouquet(bouquet.bouquet_name)
    }));
  }

  /**
   * Categorize bouquet based on name
   */
  categorizeBouquet(name) {
    const upperName = name.toUpperCase();
    
    if (upperName.startsWith('M-')) return 'Movies VOD';
    if (upperName.startsWith('S-')) return 'TV Shows VOD';
    if (upperName.startsWith('USA') || upperName.startsWith('US ')) return 'USA';
    if (upperName.startsWith('24/7')) return '24/7 Channels';
    if (upperName.startsWith('CANADA')) return 'Canada';
    if (upperName.startsWith('UK')) return 'UK';
    if (upperName.startsWith('LIBRE')) return 'Future Groups';
    if (upperName.startsWith('4K')) return '4K';
    if (upperName.includes('MLB') || upperName.includes('NBA') || upperName.includes('NFL') || 
        upperName.includes('NHL') || upperName.includes('SPORT')) return 'Sports';
    if (upperName.includes('UFC EVENTS') || upperName.includes('PPV')) return 'PPV';
    
    return 'Others';
  }

  /**
   * Sync credit balance from panel with session management
   */
  async syncCreditsFromPanel() {
    try {
      console.log('🔄 Syncing credit balance from panel...');
      
      await this.ensureAuthenticated();
      
      const response = await axios.get(`${this.baseURL}/rlogs/credits`, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cookie': this.sessionCookies,
          'Referer': this.baseURL
        }
      });

      // DON'T UPDATE COOKIES FOR CREDITS PAGE - IT BREAKS SESSION
      console.log('📊 Credits response status:', response.status);
      console.log('📊 Credits HTML length:', response.data.length);
      
      // Check for session expiration
      if (response.data === 'no access.' || response.data.includes('no access') || response.data.length < 100) {
        console.log('⚠️ Session expired or no access for credits, re-authenticating...');
        
        this.csrfToken = null;
        this.sessionCookies = null;
        await this.loginToPanel();
        
        // Retry request
        const retryResponse = await axios.get(`${this.baseURL}/rlogs/credits`, {
          timeout: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Cookie': this.sessionCookies,
            'Referer': this.baseURL
          }
        });
        
        return this.parseCreditsFromHTML(retryResponse.data);
      }
      
      return this.parseCreditsFromHTML(response.data);
      
    } catch (error) {
      console.error('❌ Failed to sync credits:', error.message);
      throw error;
    }
  }

  /**
   * Parse credits from HTML content
   */
  parseCreditsFromHTML(htmlContent) {
    let credits = 0;
    
    console.log('🔍 Parsing credits from HTML...');
    console.log('🔍 HTML length for credits:', htmlContent.length);
    
    // Multiple patterns to find credits
    const patterns = [
      /Credits:\s*(\d+)/i,
      /label-warning[^>]*>\s*Credits:\s*(\d+)/i,
      /<div[^>]*class="[^"]*label[^"]*warning[^"]*"[^>]*>\s*Credits:\s*(\d+)/i,
      /credits[^>]*>\s*(\d+)/i,
      />Credits:\s*(\d+)</i,
      /balance[^>]*>\s*(\d+)/i,
      /credit.*?(\d+)/i
    ];
    
    // Debug: Show sample of HTML content
    const creditSample = htmlContent.substring(0, 1000);
    console.log('🔍 HTML sample for credits:', creditSample);
    
    // Look for "Credits:" in the HTML
    if (htmlContent.includes('Credits:')) {
      console.log('✅ Found "Credits:" text in HTML');
      const creditsIndex = htmlContent.indexOf('Credits:');
      const surrounding = htmlContent.substring(Math.max(0, creditsIndex - 100), creditsIndex + 100);
      console.log('🔍 Text around Credits:', surrounding);
    } else {
      console.log('⚠️ No "Credits:" text found in HTML');
    }
    
    for (const pattern of patterns) {
      const match = htmlContent.match(pattern);
      if (match && match[1]) {
        credits = parseInt(match[1], 10);
        console.log(`✅ Found credits using pattern ${pattern}: ${credits}`);
        break;
      }
    }
    
    if (credits === 0) {
      console.log('⚠️ Could not find credits in HTML');
      
      // Try to find any numbers that might be credits
      const numberMatches = htmlContent.match(/\d+/g);
      if (numberMatches) {
        console.log('🔍 All numbers found in HTML:', numberMatches.slice(0, 10));
      }
    }

    this.creditsBalance = credits;
    this.updateSetting('iptv_credits_balance', credits.toString()).catch(console.error);
    
    console.log('✅ Credit balance synced:', credits, 'credits');
    return credits;
  }

  /**
   * Test connection to IPTV panel
   */
  async testConnection() {
    try {
      await this.initialize();
      
      if (!this.loginURL) {
        throw new Error('Login URL is empty - settings not configured');
      }
      
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
   * Refresh authentication (for hourly cron job)
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
   * Create trial user (24 hours)
   */
  async createTrialUser(username, password, packageId, bouquetIds = []) {
    try {
      console.log(`🆓 Creating trial user: ${username}`);
      
      const bouquetString = Array.isArray(bouquetIds) ? bouquetIds.join(',') : bouquetIds;
      
      const data = {
        line_type: 'line',
        username: username,
        password: password || '',
        mac: '',
        forced_country: 'US',
        package: packageId,
        current_bouquets: bouquetString,
        q: '',
        description: `Trial user created via JohnsonFlix Manager`
      };

      const response = await this.makeAPIRequest('/lines/create/1', data);
      
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
      
      const packageInfo = await this.getPackageInfo(packageId);
      const credits = packageInfo ? packageInfo.credits : 0;
      
      const bouquetString = Array.isArray(bouquetIds) ? bouquetIds.join(',') : bouquetIds;
      
      const data = {
        line_type: 'line',
        username: username,
        password: password || '',
        mac: '',
        forced_country: 'US',
        package: packageId,
        current_bouquets: bouquetString,
        q: '',
        description: `Paid user created via JohnsonFlix Manager`
      };

      const response = await this.makeAPIRequest('/lines/create/0', data);
      
      await this.updateLocalCredits(-credits);
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
      
      const packageInfo = await this.getPackageInfo(packageId);
      const credits = packageInfo ? packageInfo.credits : 0;
      
      const bouquetString = Array.isArray(bouquetIds) ? bouquetIds.join(',') : bouquetIds;
      
      const data = {
        package: packageId,
        current_bouquets: bouquetString
      };

      const response = await this.makeAPIRequest(`/lines/extend/${lineId}`, data);
      
      await this.updateLocalCredits(-credits);
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
   * Get all users from IPTV panel
   */
  async getAllPanelUsers() {
    try {
      const response = await this.makeAPIRequest('/lines/data');
      
      if (response && response.data && Array.isArray(response.data)) {
        return response.data;
      }
      
      if (response && Array.isArray(response)) {
        return response;
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
      console.log('📦 Syncing packages (subscription plans) from panel...');
      
      const packages = await this.getPackagesFromPanel();
      
      if (packages.length === 0) {
        console.log('⚠️ No packages found to sync');
        return 0;
      }
      
      // Clear existing packages
      await db.query('DELETE FROM iptv_packages');
      
      // Insert new packages
      for (const pkg of packages) {
        await db.query(`
          INSERT INTO iptv_packages (package_id, name, connections, duration_months, credits, package_type, synced_at)
          VALUES (?, ?, ?, ?, ?, ?, NOW())
        `, [
          pkg.id,
          pkg.name,
          pkg.connections,
          pkg.duration_months,
          pkg.credits,
          pkg.package_type
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
      console.log('📺 Syncing bouquets (channel groups) from panel...');
      
      const bouquets = await this.getBouquetsFromPanel();
      console.log(`🔍 Got ${bouquets.length} bouquets from panel`);
      
      if (bouquets.length === 0) {
        console.log('⚠️ No bouquets found to sync');
        return 0;
      }
      
      let insertedCount = 0;
      
      // Insert/update bouquets one by one
      for (const bouquet of bouquets) {
        try {
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
        }
      }
      
      console.log(`✅ Successfully synced ${insertedCount} bouquets from panel`);
      return insertedCount;
    } catch (error) {
      console.error('❌ Failed to sync bouquets:', error);
      throw new Error(`Failed to sync bouquets: ${error.message}`);
    }
  }

  /**
   * Get package info from local database
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
   * Log IPTV activity
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
   * Get available packages from database
   */
  async getAvailablePackages() {
    try {
      const rows = await db.query(`
        SELECT * FROM iptv_packages 
        WHERE is_active = true 
        ORDER BY package_type, duration_months, connections
      `);
      
      return Array.isArray(rows) ? rows : [];
    } catch (error) {
      console.error('❌ Failed to get available packages:', error);
      return [];
    }
  }

  /**
   * Get channel groups from database
   */
  async getChannelGroups() {
    try {
      const rows = await db.query(`
        SELECT * FROM iptv_channel_groups 
        WHERE is_active = true 
        ORDER BY name
      `);
      
      return Array.isArray(rows) ? rows : [];
    } catch (error) {
      console.error('❌ Failed to get channel groups:', error);
      return [];
    }
  }

  /**
   * Create new channel group
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
   * Generate stream URLs for user
   */
  generateStreamURLs(username, password) {
    if (!username || !password) {
      return {};
    }

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

    return `https://Pinkpony.lol:443|${username}|${password}`;
  }

  /**
   * Calculate expiration date based on package
   */
  calculateExpirationDate(packageInfo, isExtending = false, currentExpiration = null) {
    const now = new Date();
    let startDate = now;
    
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
   * Update user IPTV details in database
   */
  async updateUserIPTVDetails(userId, iptvData) {
    try {
      const updateFields = [];
      const updateValues = [];
      
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
   * Clear user IPTV data
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
   * Get activity logs
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