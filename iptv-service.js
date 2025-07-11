// iptv-service.js - IPTV Panel API Integration Service - COMPLETELY REWRITTEN
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
    
    // Rate limiting and retry management
    this.retryInProgress = false;
    this.lastLoginTime = null;
    this.minLoginInterval = 5000; // 5 seconds between logins
  }

  /**
   * Initialize service with settings from database
   */
  async initialize() {
    try {
      const settings = await this.loadSettings();
      this.baseURL = settings.iptv_panel_base_url || 'https://panel.pinkpony.lol';
      this.loginURL = settings.iptv_panel_login_url || 'https://panel.pinkpony.lol/login/rwvykjyh';
      this.username = settings.iptv_panel_username || 'johnsonflix';
      this.password = settings.iptv_panel_password || 'goldGr!p51';
      this.packageIdForBouquets = settings.iptv_package_id_for_bouquets || '175';
      
      // Restore cached authentication if still valid
      this.csrfToken = settings.iptv_csrf_token;
      this.sessionCookies = settings.iptv_session_cookies;
      
      if (settings.iptv_csrf_expires) {
        this.csrfExpires = new Date(settings.iptv_csrf_expires);
      }
      
      this.creditsBalance = parseInt(settings.iptv_credits_balance) || 0;

      console.log('🎯 IPTV Service initialized with panel:', this.baseURL);
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
   * Check if we have valid authentication
   */
  isAuthenticated() {
    if (!this.csrfToken || !this.sessionCookies) {
      return false;
    }
    
    if (this.csrfExpires && new Date() > this.csrfExpires) {
      console.log('🔑 CSRF token expired, need fresh login');
      return false;
    }
    
    return true;
  }

  /**
   * Get CSRF token from login page - STEP 1 OF AUTHENTICATION
   */
  async getCSRFTokenAndCookies() {
    try {
      console.log('🔑 Getting CSRF token from:', this.loginURL);
      
      const response = await axios({
        method: 'GET',
        url: this.loginURL,
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        }
      });

      const responseText = response.data;
      console.log('📄 Login page response length:', responseText.length);
      
      // Extract CSRF token using multiple patterns (exact same as your working Postman script)
      let csrfToken = null;
      
      // Pattern 1: name="_token" value="TOKEN"
      const tokenMatch = responseText.match(/name=["\']_token["\'][^>]*value=["\']([^"\']+)["\']/);
      if (tokenMatch) {
        csrfToken = tokenMatch[1];
        console.log("✅ CSRF Token found via _token pattern:", csrfToken.substring(0, 20) + '...');
      }
      
      // Pattern 2: name="csrf-token" content="TOKEN" (this will overwrite if found)
      const metaMatch = responseText.match(/name=["\']csrf-token["\'][^>]*content=["\']([^"\']+)["\']/);
      if (metaMatch) {
        csrfToken = metaMatch[1];
        console.log("✅ CSRF Token found via meta pattern:", csrfToken.substring(0, 20) + '...');
      }
      
      if (!csrfToken) {
        console.log('🔍 HTML preview for token debugging:', responseText.substring(0, 500));
        throw new Error('CSRF token not found in login page');
      }
      
      // CRITICAL: Extract and store initial session cookies
      const setCookieHeaders = response.headers['set-cookie'] || [];
      let sessionCookies = '';
      
      setCookieHeaders.forEach(cookie => {
        const cookiePart = cookie.split(';')[0];
        if (cookiePart.includes('XSRF-TOKEN') || cookiePart.includes('management_session') || cookiePart.includes('laravel_session')) {
          sessionCookies += cookiePart + '; ';
        }
      });
      
      if (sessionCookies) {
        this.sessionCookies = sessionCookies.trim();
        console.log('🍪 Captured initial session cookies:', this.sessionCookies.substring(0, 50) + '...');
      }
      
      return csrfToken;
    } catch (error) {
      console.error('❌ Failed to get CSRF token:', error.message);
      throw new Error(`Failed to get CSRF token: ${error.message}`);
    }
  }

  /**
   * Login to IPTV panel - STEP 2 OF AUTHENTICATION 
   * This follows the exact working flow from your Postman tests
   */
  async loginToPanel() {
    try {
      // Rate limiting: Don't login too frequently
      if (this.lastLoginTime && (Date.now() - this.lastLoginTime) < this.minLoginInterval) {
        console.log('⏳ Rate limiting: Too soon since last login, waiting...');
        await new Promise(resolve => setTimeout(resolve, this.minLoginInterval));
      }
      
      console.log('🔐 Starting IPTV panel login process...');
      
      // Step 1: Get CSRF token and initial cookies
      const csrfToken = await this.getCSRFTokenAndCookies();
      
      // Step 2: Perform login with credentials
      console.log('📤 Posting login credentials...');
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
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': this.loginURL,
          'Origin': this.baseURL,
          'Connection': 'keep-alive',
          'Cookie': this.sessionCookies || '',
          'Upgrade-Insecure-Requests': '1'
        },
        maxRedirects: 0,  // Don't auto-follow redirects
        validateStatus: function (status) {
          return status >= 200 && status < 400; // Accept both 200 and 302
        }
      });

      console.log('✅ Login response status:', loginResponse.status);
      
      // Step 3: Extract updated session cookies from login response
      const loginSetCookieHeaders = loginResponse.headers['set-cookie'] || [];
      let updatedSessionCookies = this.sessionCookies || '';
      
      loginSetCookieHeaders.forEach(cookie => {
        const cookiePart = cookie.split(';')[0];
        if (cookiePart.includes('XSRF-TOKEN')) {
          // Replace or add XSRF-TOKEN
          updatedSessionCookies = updatedSessionCookies.replace(/XSRF-TOKEN=[^;]*;?\s*/, '');
          updatedSessionCookies += cookiePart + '; ';
        } else if (cookiePart.includes('management_session')) {
          // Replace or add management_session
          updatedSessionCookies = updatedSessionCookies.replace(/management_session=[^;]*;?\s*/, '');
          updatedSessionCookies += cookiePart + '; ';
        } else if (cookiePart.includes('laravel_session')) {
          // Replace or add laravel_session
          updatedSessionCookies = updatedSessionCookies.replace(/laravel_session=[^;]*;?\s*/, '');
          updatedSessionCookies += cookiePart + '; ';
        }
      });

      // Step 4: Get fresh CSRF token from dashboard for API calls
      console.log('🔄 Getting fresh CSRF token from dashboard...');
      const dashboardURL = loginResponse.status === 302 && loginResponse.headers.location ? 
                           loginResponse.headers.location : 
                           this.baseURL + '/dashboard';
      
      const dashboardResponse = await axios({
        method: 'GET',
        url: dashboardURL,
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cookie': updatedSessionCookies.trim(),
          'Referer': this.loginURL,
          'Connection': 'keep-alive'
        }
      });

      // Extract fresh CSRF token for API calls
      const freshCsrfMatch = dashboardResponse.data.match(/name=["\']csrf-token["\'][^>]*content=["\']([^"\']+)["\']/);
      const freshMetaCsrfMatch = dashboardResponse.data.match(/name=["\']_token["\'][^>]*value=["\']([^"\']+)["\']/);
      
      const freshCsrfToken = freshCsrfMatch ? freshCsrfMatch[1] : (freshMetaCsrfMatch ? freshMetaCsrfMatch[1] : csrfToken);
      
      // Store the final authentication data
      this.csrfToken = freshCsrfToken;
      this.sessionCookies = updatedSessionCookies.trim();
      this.csrfExpires = new Date(Date.now() + (30 * 60 * 1000)); // 30 minutes
      this.lastLoginTime = Date.now();
      
      // Save to database for persistence
      await this.updateSetting('iptv_csrf_token', this.csrfToken);
      await this.updateSetting('iptv_session_cookies', this.sessionCookies);
      await this.updateSetting('iptv_csrf_expires', this.csrfExpires.toISOString());
      
      console.log('🔐 Final session cookies:', this.sessionCookies.substring(0, 50) + '...');
      console.log('🔑 Final CSRF token:', this.csrfToken.substring(0, 20) + '...');
      console.log('✅ Successfully logged into IPTV panel');
      
      return true;
      
    } catch (error) {
      console.error('❌ Failed to login to IPTV panel:', error.message);
      // Clear invalid credentials
      this.csrfToken = null;
      this.sessionCookies = null;
      this.csrfExpires = null;
      throw new Error(`Login failed: ${error.message}`);
    }
  }

  /**
   * Ensure we have valid authentication - with smart retry logic
   */
  async ensureAuthenticated() {
    if (!this.baseURL || !this.loginURL || !this.username || !this.password) {
      throw new Error('IPTV panel credentials not configured. Please check settings.');
    }

    if (this.isAuthenticated()) {
      console.log('✅ Using existing valid authentication');
      return true;
    }

    console.log('🔄 Authentication expired or missing, performing fresh login...');
    return await this.loginToPanel();
  }

  /**
   * Get packages from IPTV panel - FIXED PARSING LOGIC
   */
  async getPackagesFromPanel() {
    try {
      console.log('📦 Getting packages from IPTV panel...');
      
      // Ensure fresh authentication
      await this.ensureAuthenticated();
      
      // Add delay after authentication
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const createUrl = `${this.baseURL}/lines/create/0/line`;
      console.log('🔍 Fetching packages from:', createUrl);
      
      const response = await axios({
        method: 'GET',
        url: createUrl,
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cookie': this.sessionCookies,
          'Referer': this.baseURL + '/dashboard',
          'Connection': 'keep-alive'
        }
      });
      
      console.log('📄 Package form response status:', response.status);
      console.log('📄 Package form response length:', response.data.length);
      
      // Check for authentication failure
      if (response.data === 'no access.' || response.data.includes('no access') || response.data.length < 100) {
        console.log('❌ Got "no access" response - authentication failed');
        throw new Error('Authentication failed: Got "no access" response from panel');
      }
      
      // Parse packages from the HTML
      return this.parsePackageOptions(response.data);
      
    } catch (error) {
      console.error('❌ Failed to get packages:', error.message);
      throw new Error(`Failed to get packages: ${error.message}`);
    }
  }
  
/**
   * Get trial packages from IPTV panel
   */
  async getTrialPackagesFromPanel() {
    try {
      console.log('🆓 Getting trial packages from IPTV panel...');
      
      // Ensure fresh authentication
      await this.ensureAuthenticated();
      
      // Add delay after authentication
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // TRIAL ENDPOINT: /lines/create/1/line
      const trialCreateUrl = `${this.baseURL}/lines/create/1/line`;
      console.log('🔍 Fetching trial packages from:', trialCreateUrl);
      
      const response = await axios({
        method: 'GET',
        url: trialCreateUrl,
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cookie': this.sessionCookies,
          'Referer': this.baseURL + '/dashboard',
          'Connection': 'keep-alive'
        }
      });
      
      console.log('📄 Trial package form response status:', response.status);
      console.log('📄 Trial package form response length:', response.data.length);
      
      // Check for authentication failure
      if (response.data === 'no access.' || response.data.includes('no access') || response.data.length < 100) {
        console.log('❌ Got "no access" response - authentication failed');
        throw new Error('Authentication failed: Got "no access" response from panel');
      }
      
      // Parse trial packages from the HTML
      const trialPackages = this.parsePackageOptions(response.data, true);
      console.log(`✅ Found ${trialPackages.length} trial packages`);
      
      return trialPackages;
      
    } catch (error) {
      console.error('❌ Failed to get trial packages:', error.message);
      throw new Error(`Failed to get trial packages: ${error.message}`);
    }
  }

/**
   * Parse package options from HTML - ENHANCED FOR TRIAL/PAID DETECTION
   */
  parsePackageOptions(htmlContent, isTrial = false) {
    console.log(`🔍 Parsing ${isTrial ? 'trial' : 'paid'} package options from HTML...`);
    console.log('🔍 HTML content length:', htmlContent.length);
    
    const packages = [];
    
    // Look for the package select element by ID or name
    const packageSelectPattern = /<select[^>]*(?:id="package"|name="package")[^>]*>([\s\S]*?)<\/select>/i;
    const selectMatch = htmlContent.match(packageSelectPattern);
    
    if (!selectMatch) {
      console.log('❌ Could not find package select element');
      return packages;
    }
    
    const selectContent = selectMatch[1];
    console.log('✅ Found package select content, length:', selectContent.length);
    
    // Parse each option element with data attributes
    // Based on the HTML structure: <option value="34" data-credits="1" data-duration="1" data-duration-in="months" data-connections="2">
    const optionPattern = /<option\s+value="(\d+)"\s+data-credits="(\d+)"\s+data-duration="(\d+)"\s+data-duration-in="([^"]+)"\s+data-connections="(\d+)"[^>]*>\s*([^<]+)\s*<\/option>/gi;
    
    let optionMatch;
    while ((optionMatch = optionPattern.exec(selectContent)) !== null) {
      const [, id, credits, duration, durationUnit, connections, description] = optionMatch;
      
      // Skip empty or "Select one please" options
      if (id && !description.toLowerCase().includes('select') && !description.toLowerCase().includes('please')) {
        const cleanDescription = description.trim();
        
        // For trial packages, set credits to 0 and mark as trial type
        const packageType = isTrial ? 'trial' : this.determinePackageType(id, cleanDescription);
        const finalCredits = isTrial ? 0 : parseInt(credits);
        
        console.log(`🔍 Found ${isTrial ? 'trial' : 'paid'} package: ID=${id}, Credits=${finalCredits}, Duration=${duration} ${durationUnit}, Connections=${connections}`);
        console.log(`🔍 Description: ${cleanDescription}`);
        
        packages.push({
          id: id,
          name: this.extractPackageName(cleanDescription),
          connections: parseInt(connections),
          duration_months: this.convertDurationToMonths(parseInt(duration), durationUnit),
          duration_unit: durationUnit,
          credits: finalCredits,
          description: cleanDescription,
          package_type: packageType
        });
        
        console.log(`✅ Extracted ${isTrial ? 'trial' : 'paid'} package: ID=${id}, Credits=${finalCredits}, Duration=${duration} ${durationUnit}, Connections=${connections}`);
      }
    }
    
    // If the strict pattern didn't work, try a more flexible pattern
    if (packages.length === 0) {
      console.log('🔄 Strict pattern failed, trying flexible parsing...');
      
      // More flexible pattern that handles different attribute orders
      const flexiblePattern = /<option[^>]*value="(\d+)"[^>]*data-credits="(\d+)"[^>]*data-duration="(\d+)"[^>]*data-duration-in="([^"]+)"[^>]*data-connections="(\d+)"[^>]*>\s*([^<]+)\s*<\/option>/gi;
      
      let flexMatch;
      while ((flexMatch = flexiblePattern.exec(selectContent)) !== null) {
        const [, id, credits, duration, durationUnit, connections, description] = flexMatch;
        
        if (id && !description.toLowerCase().includes('select') && !description.toLowerCase().includes('please')) {
          const cleanDescription = description.trim();
          
          // For trial packages, set credits to 0 and mark as trial type
          const packageType = isTrial ? 'trial' : this.determinePackageType(id, cleanDescription);
          const finalCredits = isTrial ? 0 : parseInt(credits);
          
          packages.push({
            id: id,
            name: this.extractPackageName(cleanDescription),
            connections: parseInt(connections),
            duration_months: this.convertDurationToMonths(parseInt(duration), durationUnit),
            duration_unit: durationUnit,
            credits: finalCredits,
            description: cleanDescription,
            package_type: packageType
          });
          
          console.log(`✅ Flexible match - ${isTrial ? 'trial' : 'paid'} Package: ID=${id}, Credits=${finalCredits}, Duration=${duration} ${durationUnit}, Connections=${connections}`);
        }
      }
    }
    
    // If still no packages, try even more basic parsing
    if (packages.length === 0) {
      console.log('🔄 All patterns failed, trying basic option parsing...');
      
      // Just find all options with values and try to extract what we can
      const basicPattern = /<option[^>]*value="(\d+)"[^>]*>([^<]+)<\/option>/gi;
      let basicMatch;
      
      while ((basicMatch = basicPattern.exec(selectContent)) !== null) {
        const [fullMatch, id, description] = basicMatch;
        
        if (id && !description.toLowerCase().includes('select') && !description.toLowerCase().includes('please')) {
          console.log(`🔍 Basic option found: ID=${id}, Description=${description.trim()}`);
          
          // Try to extract attributes from the full match
          const creditsMatch = fullMatch.match(/data-credits="(\d+)"/);
          const durationMatch = fullMatch.match(/data-duration="(\d+)"/);
          const durationInMatch = fullMatch.match(/data-duration-in="([^"]+)"/);
          const connectionsMatch = fullMatch.match(/data-connections="(\d+)"/);
          
          if (creditsMatch && connectionsMatch && durationMatch && durationInMatch) {
            const credits = parseInt(creditsMatch[1]);
            const duration = parseInt(durationMatch[1]);
            const durationUnit = durationInMatch[1];
            const connections = parseInt(connectionsMatch[1]);
            
            // For trial packages, set credits to 0 and mark as trial type
            const packageType = isTrial ? 'trial' : this.determinePackageType(id, description.trim());
            const finalCredits = isTrial ? 0 : credits;
            
            packages.push({
              id: id,
              name: this.extractPackageName(description.trim()),
              connections: connections,
              duration_months: this.convertDurationToMonths(duration, durationUnit),
              duration_unit: durationUnit,
              credits: finalCredits,
              description: description.trim(),
              package_type: packageType
            });
            
            console.log(`✅ Basic parsed ${isTrial ? 'trial' : 'paid'} package: ID=${id}, Credits=${finalCredits}, Duration=${duration} ${durationUnit}, Connections=${connections}`);
          }
        }
      }
    }
    
    // Debug: Show some sample content if still failing
    if (packages.length === 0) {
      console.log('❌ No packages extracted. Sample content:');
      console.log(selectContent.substring(0, 1000));
    }
    
    console.log(`✅ Successfully parsed ${packages.length} ${isTrial ? 'trial' : 'paid'} packages from panel`);
    return packages;
  }
  
  
  /**
   * Get bouquets from IPTV panel - FIXED CSRF AND SESSION HANDLING
   */
  async getBouquetsFromPanel(packageId = null) {
    try {
      console.log('📺 Getting bouquets (channel groups) from panel...');
      
      // Use the package ID from settings or parameter
      const pkgId = packageId || this.packageIdForBouquets || '175';
      console.log('🔍 Using package ID for bouquets:', pkgId);
      
      // Ensure fresh authentication
      await this.ensureAuthenticated();
      
      // Add delay to ensure session is ready
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Make the API request with proper headers
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
          'Referer': this.baseURL + '/lines/create/0/line',
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
      if (error.response && (error.response.status === 419 || error.response.status === 403)) {
        console.log('🔄 CSRF/Auth error, attempting fresh login and retry...');
        try {
          // Force fresh login
          this.csrfToken = null;
          this.sessionCookies = null;
          this.csrfExpires = null;
          await this.loginToPanel();
          
          // Wait a bit longer before retry
          await new Promise(resolve => setTimeout(resolve, 3000));
          
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
   * Extract package name from description - UPDATED WITH ACTUAL DESCRIPTIONS
   */
  extractPackageName(description) {
    // Based on actual descriptions from the HTML:
    // "2 Con. / 1 month / 1 Credit* - cost 1 credits - 1 months"
    // "USA, CAN, UK, LAT, SPORTS, 24/7, VOD, PPV, ADULT - 2 Con. / 1 month / 1 Credit*"
    // "LIVE TV ONLY - 2 Con. / 1 month / 1 Credit*"
    
    const lowerDesc = description.toLowerCase();
    let packageName = '';
    
    if (lowerDesc.includes('usa, can, uk, lat, sports, 24/7, vod, ppv, adult')) {
      packageName = 'Full Service Premium';
    } else if (lowerDesc.includes('live tv only')) {
      packageName = 'Live TV Only';
    } else if (lowerDesc.match(/^\d+\s+con\./)) {
      // Basic packages that start with connection count: "2 Con. / 1 month / 1 Credit*"
      packageName = 'Basic Package';
    } else {
      // Extract the part before the first " - " or use first part
      const dashIndex = description.indexOf(' - ');
      if (dashIndex > -1) {
        packageName = description.substring(0, dashIndex).trim();
      } else {
        // Extract first meaningful part (before connection info)
        const conIndex = description.indexOf('Con.');
        if (conIndex > -1) {
          const beforeCon = description.substring(0, conIndex).trim();
          if (beforeCon.length > 10) { // If there's meaningful text before "Con."
            packageName = beforeCon;
          } else {
            packageName = 'Basic Package';
          }
        } else {
          packageName = description.trim();
        }
      }
    }
    
    // Clean up common patterns
    packageName = packageName.replace(/\s*-\s*$/, ''); // Remove trailing dash
    packageName = packageName.replace(/\*$/, ''); // Remove trailing asterisk
    
    return packageName || 'Package';
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
   * Categorize bouquet based on name - UPDATED WITH ACTUAL BOUQUET NAMES
   */
  categorizeBouquet(name) {
    const upperName = name.toUpperCase();
    
    // Based on actual bouquet names from the JSON response
    if (upperName.startsWith('M-')) return 'Movies VOD';
    if (upperName.startsWith('S-')) return 'TV Shows VOD';
    if (upperName.startsWith('USA') || upperName.startsWith('US ')) return 'USA';
    if (upperName.startsWith('24/7')) return '24/7 Channels';
    if (upperName.startsWith('CANADA') || upperName.includes('CANADIAN')) return 'Canada';
    if (upperName.startsWith('UK') || upperName.includes('UK ')) return 'UK';
    if (upperName.startsWith('LIBRE') || upperName.includes('LIBRE')) return 'Future Groups';
    if (upperName.startsWith('4K')) return '4K';
    if (upperName.startsWith('LAT ')) return 'Latin America';
    
    // Sports categories
    if (upperName.includes('MLB') || upperName.includes('NBA') || upperName.includes('NFL') || 
        upperName.includes('NHL') || upperName.includes('SPORT') || upperName.includes('GAMES') ||
        upperName.includes('RACING') || upperName.includes('UFC') || upperName.includes('SOCCER') ||
        upperName.includes('FUTBOL') || upperName.includes('LIGA') || upperName.includes('NCAAF') ||
        upperName.includes('NCAAB') || upperName.includes('MLS') || upperName.includes('PREMIER LEAGUE') ||
        upperName.includes('DAZN') || upperName.includes('FLOSPORT') || upperName.includes('ESPN') ||
        upperName.includes('SPORTSNET') || upperName.includes('HOCKEY') || upperName.includes('FORMULA1') ||
        upperName.includes('PEACOCK EVENTS') || upperName.includes('FUBO SPORTS') || upperName.includes('STAN SPORTS') ||
        upperName.includes('OPTUS SPORT') || upperName.includes('STARHUB SPORTS') || upperName.includes('SKY SPORTS') ||
        upperName.includes('WNBA') || upperName.includes('MILB')) return 'Sports';
    
    // PPV and Events
    if (upperName.includes('PPV') || upperName.includes('EVENTS') || upperName.includes('FITE EVENTS')) return 'PPV';
    
    // Adult content
    if (upperName.includes('ADULT') || upperName.includes('FOR ADULTS')) return 'Adult';
    
    // Entertainment
    if (upperName.includes('ENTERTAINMENT') || upperName.includes('ENTRENIMIENTO')) return 'Entertainment';
    
    // News
    if (upperName.includes('NEWS') || upperName.includes('NOTICIAS')) return 'News';
    
    // Kids/Family
    if (upperName.includes('KIDS') || upperName.includes('INFANTIL')) return 'Kids';
    
    // Music
    if (upperName.includes('MUSIC') || upperName.includes('MUSICA')) return 'Music';
    
    // Movies
    if (upperName.includes('MOVIE') || upperName.includes('CINEMA') || upperName.includes('PELICULAS')) return 'Movies';
    
    // Documentaries
    if (upperName.includes('DOCUMENTAR') || upperName.includes('DISCOVERY')) return 'Documentaries';
    
    // Local/Regional channels
    if (upperName.includes('LOCAL') || upperName.includes('LOCALES') || upperName.includes('UNIVISION') ||
        upperName.includes('TELEMUNDO')) return 'Local Channels';
    
    // Country-specific
    if (upperName.includes('ARGENTINA') || upperName === 'ARGENTINA') return 'Argentina';
    if (upperName.includes('MEXICO') || upperName === 'MEXICO') return 'Mexico';
    if (upperName.includes('COLOMBIA') || upperName === 'COLOMBIA') return 'Colombia';
    if (upperName.includes('CHILE') || upperName === 'CHILE') return 'Chile';
    if (upperName.includes('PERU') || upperName === 'PERU') return 'Peru';
    if (upperName.includes('VENEZUELA') || upperName === 'VENEZUELA') return 'Venezuela';
    if (upperName.includes('ECUADOR') || upperName === 'ECUADOR') return 'Ecuador';
    if (upperName.includes('BOLIVIA') || upperName === 'BOLIVIA') return 'Bolivia';
    if (upperName.includes('PARAGUAY') || upperName === 'PARAGUAY') return 'Paraguay';
    if (upperName.includes('URUGUAY') || upperName === 'URUGUAY') return 'Uruguay';
    if (upperName.includes('PANAMA') || upperName === 'PANAMA') return 'Panama';
    if (upperName.includes('HONDURAS') || upperName === 'HONDURAS') return 'Honduras';
    if (upperName.includes('GUATEMALA') || upperName === 'GUATEMALA') return 'Guatemala';
    if (upperName.includes('NICARAGUA') || upperName === 'NICARAGUA') return 'Nicaragua';
    if (upperName.includes('COSTA RICA') || upperName === 'COSTA RICA') return 'Costa Rica';
    if (upperName.includes('EL SALVADOR') || upperName === 'EL SALVADOR') return 'El Salvador';
    if (upperName.includes('REPUBLICA DOMINICANA')) return 'Dominican Republic';
    if (upperName.includes('PUERTO RICO') || upperName === 'PUERTO RICO') return 'Puerto Rico';
    if (upperName.includes('CUBA') || upperName.includes('MIAMI')) return 'Cuba/Miami';
    if (upperName.includes('BRASIL') || upperName === 'BRASIL') return 'Brazil';
    if (upperName.includes('ESPAÑA') || upperName === 'ESPAÑA') return 'Spain';
    if (upperName.includes('FRANCE') || upperName === 'FRANCE') return 'France';
    if (upperName.includes('ITALY') || upperName === 'ITALY') return 'Italy';
    if (upperName.includes('PORTUGAL') || upperName === 'PORTUGAL') return 'Portugal';
    if (upperName.includes('NETHERLANDS') || upperName === 'NETHERLANDS') return 'Netherlands';
    if (upperName.includes('AUSTRALIA') || upperName === 'AUSTRALIA') return 'Australia';
    if (upperName.includes('PHILIPPINES') || upperName === 'PHILIPPINES') return 'Philippines';
    if (upperName.includes('CARIBBEAN')) return 'Caribbean';
    
    // Network-specific
    if (upperName.includes('ABC') || upperName.includes('NBC') || upperName.includes('CBS') || 
        upperName.includes('FOX') || upperName.includes('CW') || upperName.includes('PBS')) return 'USA Networks';
    
    return 'Others';
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
        session_cookies: this.sessionCookies ? 'Present' : 'Missing',
        base_url: this.baseURL,
        login_url: this.loginURL
      };
    } catch (error) {
      console.error('❌ Test connection failed:', error);
      return {
        success: false,
        message: error.message,
        error: error.toString(),
        csrf_token: this.csrfToken ? 'Present' : 'Missing',
        session_cookies: this.sessionCookies ? 'Present' : 'Missing',
        base_url: this.baseURL,
        login_url: this.loginURL
      };
    }
  }

/**
   * Sync packages from panel to database - ENHANCED FOR TRIAL + PAID
   */
  async syncPackagesFromPanel() {
    try {
      console.log('📦 Syncing packages (both trial and paid) from panel...');
      
      // Get both trial and paid packages
      const [trialPackages, paidPackages] = await Promise.all([
        this.getTrialPackagesFromPanel(),
        this.getPackagesFromPanel()
      ]);
      
      // Combine all packages
      const allPackages = [...trialPackages, ...paidPackages];
      
      if (allPackages.length === 0) {
        console.log('⚠️ No packages found to sync');
        return 0;
      }
      
      // Clear existing packages
      await db.query('DELETE FROM iptv_packages');
      
      // Insert new packages
      for (const pkg of allPackages) {
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
      
      // Update sync timestamps in settings
      const now = new Date().toISOString();
      await this.updateSetting('iptv_last_sync', now);
      await this.updateSetting('iptv_packages_last_sync', now);
      await this.updateSetting('iptv_packages_count', allPackages.length);
      await this.updateSetting('iptv_trial_packages_count', trialPackages.length);
      
      console.log(`✅ Synced ${allPackages.length} total packages (${trialPackages.length} trial, ${paidPackages.length} paid) from panel`);
      
      return allPackages.length;
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
   * Sync credit balance from panel
   */
  async syncCreditsFromPanel() {
    try {
      console.log('💳 Syncing credit balance from panel...');
      
      await this.ensureAuthenticated();
      
      const response = await axios.get(`${this.baseURL}/rlogs/credits`, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cookie': this.sessionCookies,
          'Referer': this.baseURL + '/dashboard'
        }
      });

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
            'Referer': this.baseURL + '/dashboard'
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
   * Parse credits from HTML content - FIXED WITH ACTUAL HTML STRUCTURE
   */
  parseCreditsFromHTML(htmlContent) {
    let credits = 0;
    
    console.log('🔍 Parsing credits from HTML...');
    console.log('🔍 HTML length for credits:', htmlContent.length);
    
    // The exact pattern from the HTML: <div class="label label-warning">Credits: 58</div>
    const patterns = [
      /<div[^>]*class="[^"]*label[^"]*warning[^"]*"[^>]*>Credits:\s*(\d+)<\/div>/i,
      /Credits:\s*(\d+)/i,
      /<div[^>]*class="[^"]*label[^"]*warning[^"]*"[^>]*>\s*Credits:\s*(\d+)/i,
      /label-warning[^>]*>\s*Credits:\s*(\d+)/i,
      />Credits:\s*(\d+)</i,
      /credits[^>]*>\s*(\d+)/i,
      /balance[^>]*>\s*(\d+)/i,
      /credit.*?(\d+)/i
    ];
    
    // Debug: Show sample of HTML content around credits
    if (htmlContent.includes('Credits:')) {
      console.log('✅ Found "Credits:" text in HTML');
      const creditsIndex = htmlContent.indexOf('Credits:');
      const surrounding = htmlContent.substring(Math.max(0, creditsIndex - 100), creditsIndex + 100);
      console.log('🔍 Text around Credits:', surrounding);
    } else {
      console.log('⚠️ No "Credits:" text found in HTML');
      
      // Look for the credits in the navigation bar area
      const navStart = htmlContent.indexOf('navbar-nav');
      if (navStart > -1) {
        const navEnd = htmlContent.indexOf('</ul>', navStart);
        const navContent = htmlContent.substring(navStart, navEnd);
        console.log('🔍 Navigation content sample:', navContent.substring(0, 500));
      }
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
      
      // Try to find any numbers that might be credits in the header area
      const headerStart = htmlContent.indexOf('<div id="header"');
      if (headerStart > -1) {
        const headerEnd = htmlContent.indexOf('</div>', headerStart + 1000); // Look in first 1000 chars of header
        const headerContent = htmlContent.substring(headerStart, headerEnd);
        const numberMatches = headerContent.match(/\d+/g);
        if (numberMatches) {
          console.log('🔍 Numbers found in header:', numberMatches.slice(0, 10));
        }
      }
    }

    this.creditsBalance = credits;
    this.updateSetting('iptv_credits_balance', credits.toString()).catch(console.error);
    
    console.log('✅ Credit balance parsed:', credits, 'credits');
    return credits;
  }

  /**
   * Make authenticated API request with proper error handling
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
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Cookie': this.sessionCookies || '',
          'Referer': `${this.baseURL}/lines/create/0/line`
        }
      });

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
    console.log('🔍 Fetching all panel users from /lines/data with DataTables params...');
    
    // Ensure fresh authentication (from both existing methods)
    await this.ensureAuthenticated();
    
    // DataTables parameters required by the /lines/data endpoint (NEW - fixes the search issue)
    const data = {
      draw: 1,           // Request counter
      start: 0,          // Starting record number (0 for first page)  
      length: 1000,      // Number of records to return (high number to get all)
      search: '',        // Search string (empty = no filter)
      reseller: '1435'   // Your reseller ID
    };

    console.log('📤 Sending DataTables request with params:', data);
    
    // Use makeAPIRequest with POST method and DataTables parameters
    const response = await this.makeAPIRequest('/lines/data', data, 'POST');
    
    console.log('📥 Raw /lines/data response structure:', {
      hasData: !!response.data,
      isDataArray: Array.isArray(response.data),
      dataLength: response.data ? response.data.length : 0,
      recordsTotal: response.recordsTotal,
      recordsFiltered: response.recordsFiltered,
      responseType: typeof response
    });
    
    // Handle DataTables response format (response.data contains the actual user array)
    if (response && response.data && Array.isArray(response.data)) {
      console.log(`✅ Retrieved ${response.data.length} users from panel via DataTables format`);
      
      // Log sample user data for debugging
      if (response.data.length > 0) {
        console.log('👤 Sample user data:', {
          id: response.data[0].id,
          username: response.data[0].username,
          expire_date: response.data[0].expire_date,
          enabled: response.data[0].enabled,
          user_connection: response.data[0].user_connection
        });
      }
      
      return response.data;
    }
    
    // Fallback: Handle direct array response (from existing method 1)
    if (response && Array.isArray(response)) {
      console.log(`✅ Retrieved ${response.length} users from panel via direct array format`);
      return response;
    }
    
    // If response has data property but it's not an array (from existing method 2)
    if (response && response.data) {
      const users = Array.isArray(response.data) ? response.data : [];
      console.log(`✅ Retrieved ${users.length} users from panel via response.data format`);
      return users;
    }
    
    // No data found
    console.warn('⚠️ Unexpected users response format or no data found:', {
      responseType: typeof response,
      hasData: !!response?.data,
      isResponseArray: Array.isArray(response),
      responseKeys: response ? Object.keys(response) : []
    });
    
    return [];
    
  } catch (error) {
    console.error('❌ Failed to get panel users:', error.message);
    
    // Enhanced error logging (from existing methods)
    if (error.response) {
      console.error('❌ Response status:', error.response.status);
      console.error('❌ Response data:', error.response.data);
      console.error('❌ Response headers:', error.response.headers);
    }
    
    // Check for specific authentication errors
    if (error.response && (error.response.status === 419 || error.response.status === 403)) {
      console.log('🔄 Authentication error detected, might need fresh login');
    }
    
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
   * Get all users data from panel
   * This calls the /lines/data endpoint to retrieve all users
   */
  async getAllUsersFromPanel() {
    try {
      console.log('📊 Fetching all users data from panel...');
      
      await this.ensureAuthenticated();
      
      const data = {
        id: 'users',
        filter: '',
        reseller: '1435', // Your reseller ID
        draw: 1,
        start: 0,
        length: 50 // Adjust as needed
      };

      const response = await this.makeAPIRequest('/lines/data', data);
      
      console.log('✅ Successfully fetched users data from panel');
      return response;
    } catch (error) {
      console.error('❌ Failed to fetch users data:', error);
      throw new Error(`Failed to fetch users data: ${error.message}`);
    }
  }

  /**
   * Find user data by username from panel response
   */
  findUserByUsername(usersData, username) {
    try {
      if (!usersData || !usersData.data || !Array.isArray(usersData.data)) {
        console.warn('⚠️ Invalid users data structure');
        return null;
      }

      const user = usersData.data.find(user => user.username === username);
      
      if (user) {
        console.log(`✅ Found user ${username} in panel data:`, {
          id: user.id,
          username: user.username,
          password: user.password,
          exp_date: user.exp_date,
          user_connection: user.user_connection,
          enabled: user.enabled
        });
      } else {
        console.warn(`⚠️ User ${username} not found in panel data`);
      }

      return user;
    } catch (error) {
      console.error('❌ Error finding user by username:', error);
      return null;
    }
  }

  /**
   * Parse and extract user data for database storage
   */
  parseUserDataFromPanel(panelUser) {
    if (!panelUser) return null;

    try {
      // Parse expiration date (from Unix timestamp)
      let expirationDate = null;
      if (panelUser.expire_date) {
        expirationDate = new Date(parseInt(panelUser.expire_date) * 1000);
      }

      // Calculate days until expiration
      let daysUntilExpiration = null;
      if (expirationDate) {
        const now = new Date();
        const diffTime = expirationDate - now;
        daysUntilExpiration = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }

      const userData = {
        line_id: panelUser.id,
        username: panelUser.username,
        password: panelUser.password,
        expiration_date: expirationDate,
        expiration_formatted: panelUser.exp_date, // Human readable format
        days_until_expiration: daysUntilExpiration,
        max_connections: parseInt(panelUser.user_connection) || 0,
        current_connections: parseInt(panelUser.active_connections) || 0,
        enabled: parseInt(panelUser.enabled) === 1,
        is_trial: parseInt(panelUser.is_trial) === 1,
        created_at: panelUser.created_at,
        owner: panelUser.owner
      };

      console.log('📋 Parsed user data:', userData);
      return userData;
    } catch (error) {
      console.error('❌ Error parsing user data:', error);
      return null;
    }
  }

  /**
   * Generate M3U Plus URL for user
   */
  generateM3UPlusURL(username, password) {
    return `https://Pinkpony.lol:443/get.php?username=${username}&password=${password}&type=m3u_plus&output=ts`;
  }

  /**
   * Enhanced create trial user with data retrieval
   */
  async createTrialUserWithData(username, password, packageId, bouquetIds = []) {
    try {
      console.log(`🆓 Creating trial user with data retrieval: ${username}`);
      
      // Create the user first
      const createResponse = await this.createTrialUser(username, password, packageId, bouquetIds);
      
      // Wait a moment for the user to be created in the panel
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Fetch all users data and find our new user
      const usersData = await this.getAllUsersFromPanel();
      const panelUser = this.findUserByUsername(usersData, username);
      
      if (panelUser) {
        const userData = this.parseUserDataFromPanel(panelUser);
        const m3uPlusURL = this.generateM3UPlusURL(username, userData.password);
        
        return {
          success: true,
          createResponse,
          userData,
          m3uPlusURL
        };
      } else {
        console.warn('⚠️ User created but not found in panel data - using fallback');
        return {
          success: true,
          createResponse,
          userData: {
            line_id: null,
            username: username,
            password: password,
            expiration_date: null,
            days_until_expiration: null,
            max_connections: 0,
            current_connections: 0,
            enabled: true,
            is_trial: true
          },
          m3uPlusURL: password ? this.generateM3UPlusURL(username, password) : null
        };
      }
    } catch (error) {
      console.error(`❌ Failed to create trial user with data: ${username}:`, error);
      throw error;
    }
  }

  /**
   * Enhanced create paid user with data retrieval
   */
  async createPaidUserWithData(username, password, packageId, bouquetIds = []) {
    try {
      console.log(`💰 Creating paid user with data retrieval: ${username}`);
      
      // Create the user first
      const createResponse = await this.createPaidUser(username, password, packageId, bouquetIds);
      
      // Wait a moment for the user to be created in the panel
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Fetch all users data and find our new user
      const usersData = await this.getAllUsersFromPanel();
      const panelUser = this.findUserByUsername(usersData, username);
      
      if (panelUser) {
        const userData = this.parseUserDataFromPanel(panelUser);
        const m3uPlusURL = this.generateM3UPlusURL(username, userData.password);
        
        return {
          success: true,
          createResponse,
          userData,
          m3uPlusURL
        };
      } else {
        console.warn('⚠️ User created but not found in panel data - using fallback');
        return {
          success: true,
          createResponse,
          userData: {
            line_id: null,
            username: username,
            password: password,
            expiration_date: null,
            days_until_expiration: null,
            max_connections: 0,
            current_connections: 0,
            enabled: true,
            is_trial: false
          },
          m3uPlusURL: password ? this.generateM3UPlusURL(username, password) : null
        };
      }
    } catch (error) {
      console.error(`❌ Failed to create paid user with data: ${username}:`, error);
      throw error;
    }
  }

  /**
   * Enhanced extend user with data retrieval
   */
  async extendUserWithData(lineId, packageId, bouquetIds = [], username) {
    try {
      console.log(`🔄 Extending user with data retrieval: ${lineId}`);
      
      // Extend the user first
      const extendResponse = await this.extendUser(lineId, packageId, bouquetIds);
      
      // Wait a moment for the extension to be processed
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Fetch all users data and find our extended user
      const usersData = await this.getAllUsersFromPanel();
      const panelUser = username ? 
        this.findUserByUsername(usersData, username) : 
        usersData.data.find(user => user.id === lineId.toString());
      
      if (panelUser) {
        const userData = this.parseUserDataFromPanel(panelUser);
        const m3uPlusURL = this.generateM3UPlusURL(panelUser.username, userData.password);
        
        return {
          success: true,
          extendResponse,
          userData,
          m3uPlusURL
        };
      } else {
        console.warn('⚠️ User extended but not found in panel data');
        return {
          success: true,
          extendResponse,
          userData: null,
          m3uPlusURL: null
        };
      }
    } catch (error) {
      console.error(`❌ Failed to extend user with data: ${lineId}:`, error);
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
      const settings = await this.loadSettings();
      return parseInt(settings.iptv_credits_balance) || 0;
    } catch (error) {
      console.error('❌ Failed to get local credit balance:', error);
      return 0;
    }
  }
  
  /**
   * Get current balance (alias for getLocalCreditBalance)
   */
  async getCurrentBalance() {
    return await this.getLocalCreditBalance();
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
        'iptv_expiration, iptv_credits_used, iptv_channel_group_id, iptv_connections, iptv_is_trial ' +
        'FROM users WHERE id = ?',
        [userId]
      );
      
      if (!rows || !Array.isArray(rows) || rows.length === 0) {
        return null;
      }
      
      const user = rows[0];
      
      if (user.iptv_username && user.iptv_password) {
        user.stream_urls = this.generateStreamURLs(user.iptv_username, user.iptv_password);
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
        'iptv_is_trial = 0 WHERE id = ?',
        [userId]
      );
      
      await this.logActivity(userId, null, 'clear_user_iptv', null, 0, true, null, null);
    } catch (error) {
      console.error('❌ Failed to clear user IPTV data:', error);
      throw error;
    }
  }

  /**
   * Sync credit balance from panel to local database - ALIAS METHOD
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

  /**
   * Refresh authentication (for scheduled tasks)
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
}

// Export singleton instance
module.exports = new IPTVService();