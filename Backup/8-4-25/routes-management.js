// routes-management.js - COMPLETE FIXED VERSION WITH PROPER IFRAME PROXY
const express = require('express');
const axios = require('axios');
const router = express.Router();

// Debug middleware
router.use((req, res, next) => {
  console.log(`🔍 Management Route: ${req.method} ${req.originalUrl}`);
  next();
});

// Test route
router.get('/test', (req, res) => {
  res.json({ 
    message: 'Management routes working!', 
    method: req.method,
    path: req.path,
    originalUrl: req.originalUrl,
    params: req.params
  });
});

// Get all management tools
router.get('/tools', async (req, res) => {
  try {
    const db = require('./database-config');
    const result = await db.query('SELECT setting_value FROM settings WHERE setting_key = ?', ['management_tools']);
    
    let tools = [];
    if (result.length > 0) {
      try {
        const toolsData = JSON.parse(result[0].setting_value);
        tools = Array.isArray(toolsData) ? toolsData : Object.values(toolsData);
      } catch (parseError) {
        console.error('Error parsing tools data:', parseError);
      }
    }
    
    res.json({ tools });
  } catch (error) {
    console.error('Error fetching management tools:', error);
    res.status(500).json({ error: 'Failed to fetch management tools' });
  }
});

// Create or update a management tool
router.post('/tools', async (req, res) => {
  try {
    const { tools } = req.body;
    
    if (!Array.isArray(tools)) {
      return res.status(400).json({ error: 'Tools must be an array' });
    }
    
    const db = require('./database-config');
    await db.query(`
      INSERT INTO settings (setting_key, setting_value, setting_type)
      VALUES ('management_tools', ?, 'json')
      ON DUPLICATE KEY UPDATE setting_value = ?, setting_type = 'json'
    `, [JSON.stringify(tools), JSON.stringify(tools)]);
    
    res.json({ message: 'Management tools saved successfully' });
  } catch (error) {
    console.error('Error saving management tools:', error);
    res.status(500).json({ error: 'Failed to save management tools' });
  }
});

// UNIVERSAL PROXY HANDLER - Catch everything that starts with /tools/*/proxy
router.all('*', async (req, res, next) => {
  // Check if this is a proxy request by examining the URL
  const urlPath = req.originalUrl.replace('/api/management', '');
  const proxyMatch = urlPath.match(/^\/tools\/([^\/]+)\/proxy(.*)$/);
  
  if (!proxyMatch) {
    // Not a proxy request, continue to next handler
    return next();
  }
  
  console.log(`🔗 UNIVERSAL PROXY: ${req.method} ${req.originalUrl}`);
  
  try {
    const toolId = proxyMatch[1];
    const subPath = proxyMatch[2] || '';
    const queryString = req.originalUrl.includes('?') ? req.originalUrl.split('?')[1] : '';
    
    console.log(`🎯 Proxying to tool: ${toolId}, path: "${subPath}"`);
    
    if (!toolId) {
      console.error('❌ No toolId extracted from URL');
      return res.status(400).json({ error: 'Tool ID is required' });
    }
    
    // Get tool configuration
    const db = require('./database-config');
    const result = await db.query('SELECT setting_value FROM settings WHERE setting_key = ?', ['management_tools']);
    
    if (result.length === 0) {
      console.error('❌ No management tools configured in database');
      return res.status(404).json({ error: 'No management tools configured' });
    }
    
    let tools = [];
    try {
      const toolsData = JSON.parse(result[0].setting_value);
      tools = Array.isArray(toolsData) ? toolsData : Object.values(toolsData);
      console.log(`🔍 Found ${tools.length} tools in database`);
    } catch (parseError) {
      console.error('❌ Error parsing tools data:', parseError);
      return res.status(500).json({ error: 'Invalid tools configuration' });
    }
    
    const tool = tools.find(t => t.id === toolId);
    if (!tool) {
      console.error(`❌ Tool with ID ${toolId} not found. Available tools:`, tools.map(t => ({ id: t.id, name: t.name })));
      return res.status(404).json({ error: 'Tool not found', toolId, availableTools: tools.map(t => ({ id: t.id, name: t.name })) });
    }
    
    console.log(`✅ Found tool: ${tool.name} - ${tool.url}`);
    
    // Check if tool supports iframe access
    if (tool.access_type !== 'iframe' && tool.access_type !== 'both') {
      console.error(`❌ Tool ${tool.name} does not support iframe access (${tool.access_type})`);
      return res.status(403).json({ error: 'Tool does not support iframe access' });
    }
    
    // Build target URL correctly
    let targetUrl = tool.url.replace(/\/$/, ''); // Remove trailing slash from base URL
    if (subPath) {
      targetUrl = targetUrl + subPath;
    }
    
    // Add query parameters if they exist
    if (queryString) {
      targetUrl += '?' + queryString;
    }
    
    console.log(`🎯 Proxying to: ${targetUrl}`);
    
    // Prepare request options
    const requestOptions = {
      method: req.method,
      url: targetUrl,
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': req.headers['accept'] || 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': req.headers['accept-language'] || 'en-US,en;q=0.9',
        'Accept-Encoding': req.headers['accept-encoding'] || 'gzip, deflate, br',
        'Referer': req.headers['referer'] || tool.url,
        'Host': new URL(tool.url).host,
        'Origin': new URL(tool.url).origin
      },
      timeout: 30000,
      validateStatus: () => true,
      responseType: 'stream',
      maxRedirects: 0, // Handle redirects manually to preserve cookies
      withCredentials: true
    };
    
    // Forward important headers from the browser
    const importantHeaders = [
      'authorization', 'x-csrf-token', 'x-xsrf-token', 'x-requested-with',
      'content-type', 'cache-control', 'pragma'
    ];
    
    importantHeaders.forEach(header => {
      if (req.headers[header]) {
        requestOptions.headers[header] = req.headers[header];
      }
    });
    
    // CRITICAL: Handle cookies properly for session management
    if (req.headers.cookie) {
      console.log('🍪 Forwarding cookies from browser:', req.headers.cookie.substring(0, 100) + '...');
      requestOptions.headers['Cookie'] = req.headers.cookie;
    }
    
    // Add authentication if provided
    if (tool.username && tool.password) {
      requestOptions.auth = {
        username: tool.username,
        password: tool.password
      };
      console.log(`🔐 Using authentication for ${tool.username}`);
    }
    
    // Add request body for POST/PUT requests and preserve all headers
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      console.log('📤 Processing request body...');
      requestOptions.data = req;
    }
    
    console.log(`🚀 Making request to ${targetUrl}...`);
    
    // Make the request
    const response = await axios(requestOptions);
    
    console.log(`📥 Response: ${response.status} ${response.statusText}`);
    console.log(`📦 Content-Type: ${response.headers['content-type']}`);
    
    // Handle redirects manually to preserve session
    if (response.status >= 300 && response.status < 400 && response.headers.location) {
      console.log(`🔄 Handling redirect to: ${response.headers.location}`);
      
      // Forward cookies from the redirect response
      if (response.headers['set-cookie']) {
        const cookieStrings = Array.isArray(response.headers['set-cookie']) 
          ? response.headers['set-cookie'] 
          : [response.headers['set-cookie']];
        
        cookieStrings.forEach(cookie => {
          res.append('Set-Cookie', cookie);
        });
        console.log('🍪 Forwarded Set-Cookie headers from redirect');
      }
      
      // Return redirect to browser with proxy path
      let redirectLocation = response.headers.location;
      if (redirectLocation.startsWith('/')) {
        redirectLocation = `/api/management/tools/${toolId}/proxy${redirectLocation}`;
      } else if (redirectLocation.startsWith(new URL(tool.url).origin)) {
        redirectLocation = redirectLocation.replace(new URL(tool.url).origin, `/api/management/tools/${toolId}/proxy`);
      }
      
      res.status(response.status);
      res.set('Location', redirectLocation);
      return res.end();
    }
    
    // Handle the response
    const contentType = response.headers['content-type'] || '';
    
    // Copy all response headers except problematic ones
    Object.keys(response.headers).forEach(key => {
      const lowerKey = key.toLowerCase();
      if (!['connection', 'content-encoding', 'transfer-encoding', 'content-length', 'x-frame-options', 'content-security-policy'].includes(lowerKey)) {
        res.set(key, response.headers[key]);
      }
    });
    
    // CRITICAL: Preserve Set-Cookie headers for session management
    if (response.headers['set-cookie']) {
      const cookieStrings = Array.isArray(response.headers['set-cookie']) 
        ? response.headers['set-cookie'] 
        : [response.headers['set-cookie']];
      
      cookieStrings.forEach(cookie => {
        res.append('Set-Cookie', cookie);
      });
      console.log('🍪 Forwarded Set-Cookie headers to browser');
    }
    
    // Add iframe-friendly headers
    res.set('X-Frame-Options', 'ALLOWALL');
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Cookie');
    res.set('Access-Control-Allow-Credentials', 'true');
    
    if (contentType.includes('text/html')) {
      console.log('📄 Processing HTML...');
      
      // Convert stream to string for HTML processing
      let htmlContent = '';
      response.data.on('data', chunk => {
        htmlContent += chunk.toString();
      });
      
      response.data.on('end', () => {
        console.log(`📝 HTML Content length: ${htmlContent.length} chars`);
        
        // URL rewriting for iframe compatibility
        const baseProxyPath = `/api/management/tools/${toolId}/proxy`;
        
        // Replace relative URLs with proxy URLs
        htmlContent = htmlContent
          .replace(/href="\/([^"]*?)"/g, `href="${baseProxyPath}/$1"`)
          .replace(/src="\/([^"]*?)"/g, `src="${baseProxyPath}/$1"`)
          .replace(/href='\/([^']*?)'/g, `href='${baseProxyPath}/$1'`)
          .replace(/src='\/([^']*?)'/g, `src='${baseProxyPath}/$1'`)
          .replace(/url\(\/([^)]*?)\)/g, `url(${baseProxyPath}/$1)`)
          .replace(/url\("\/([^"]*?)"\)/g, `url("${baseProxyPath}/$1")`)
          .replace(/url\('\/([^']*?)'\)/g, `url('${baseProxyPath}/$1')`)
          // Add iframe compatibility script
          .replace(/<\/body>/gi, `
            <script>
              console.log("🔗 JohnsonFlix iframe proxy loaded");
              
              // Check if we're in an iframe
              const isInIframe = window !== window.top;
              
              // Add iframe detection message
              if (isInIframe) {
                console.log("🖼️ Running inside iframe - special handling enabled");
                
                // Set credentials to include for all requests
                const originalFetch = window.fetch;
                window.fetch = function(...args) {
                  if (args[1]) {
                    args[1].credentials = 'include';
                  } else {
                    args[1] = { credentials: 'include' };
                  }
                  return originalFetch.apply(this, args);
                };
                
                // Add an option to break out of iframe if login fails
                setTimeout(() => {
                  const loginForms = document.querySelectorAll('form');
                  if (loginForms.length > 0) {
                    const breakoutDiv = document.createElement('div');
                    breakoutDiv.style.cssText = \`
                      position: fixed;
                      top: 10px;
                      right: 10px;
                      background: #f44336;
                      color: white;
                      padding: 10px;
                      border-radius: 5px;
                      z-index: 9999;
                      font-size: 12px;
                      cursor: pointer;
                      box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                    \`;
                    breakoutDiv.innerHTML = '🚪 Open in New Tab';
                    breakoutDiv.onclick = () => {
                      window.top.postMessage({
                        type: 'OPEN_IN_NEW_TAB',
                        url: window.location.href.replace('/api/management/tools/${toolId}/proxy', '')
                      }, '*');
                    };
                    document.body.appendChild(breakoutDiv);
                  }
                }, 2000);
              }
              
              // Handle form submissions for iframe compatibility
              document.addEventListener('DOMContentLoaded', function() {
                // Intercept form submissions
                const forms = document.querySelectorAll('form');
                forms.forEach(form => {
                  form.addEventListener('submit', function(e) {
                    console.log('📋 Form submission intercepted:', e);
                    
                    // For iframe context, allow natural form submission with enhanced cookie handling
                    if (isInIframe) {
                      console.log('🖼️ Iframe form submission - allowing natural submission');
                      
                      // Get form data for logging
                      const formData = new FormData(form);
                      const data = {};
                      for (let [key, value] of formData.entries()) {
                        data[key] = value;
                      }
                      console.log('📋 Form data:', data);
                      
                      // Ensure form action goes through proxy
                      let action = form.action || window.location.href;
                      if (action.startsWith('/') && !action.includes('/api/management/tools/')) {
                        action = '${baseProxyPath}' + action;
                        form.action = action;
                        console.log('📋 Updated form action to:', action);
                      }
                      
                      // Let form submit naturally - don't prevent default
                      return true;
                    }
                    
                    // Original fetch-based approach for non-iframe
                    console.log('🌐 Standard form submission via fetch');
                    
                    // Get form data
                    const formData = new FormData(form);
                    const data = {};
                    for (let [key, value] of formData.entries()) {
                      data[key] = value;
                    }
                    console.log('📋 Form data:', data);
                    
                    // Get form action
                    let action = form.action || window.location.href;
                    if (action.startsWith('/')) {
                      action = '${baseProxyPath}' + action;
                    }
                    console.log('📋 Submitting to:', action);
                    
                    // Create timeout for slow responses
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => {
                      console.log('⏰ Fetch timeout - reloading page');
                      controller.abort();
                      window.location.reload();
                    }, 15000);
                    
                    // Submit via fetch with proxy - preserve credentials and headers
                    fetch(action, {
                      method: form.method || 'POST',
                      body: formData,
                      credentials: 'include',
                      headers: {
                        'X-Requested-With': 'XMLHttpRequest'
                      },
                      signal: controller.signal
                    })
                    .then(response => {
                      clearTimeout(timeoutId);
                      if (response.ok) {
                        return response.text();
                      }
                      throw new Error('Network response was not ok');
                    })
                    .then(html => {
                      document.open();
                      document.write(html);
                      document.close();
                    })
                    .catch(error => {
                      clearTimeout(timeoutId);
                      console.log('❌ Fetch error or timeout:', error.name);
                      if (error.name !== 'AbortError') {
                        window.location.reload();
                      }
                    });
                    
                    e.preventDefault();
                    return false;
                  });
                });
              });
            </script>
            </body>`);
        
        res.set('Content-Length', Buffer.byteLength(htmlContent));
        res.status(response.status).send(htmlContent);
        console.log(`✅ HTML sent (${htmlContent.length} chars)`);
      });
      
      response.data.on('error', (error) => {
        console.error('❌ HTML stream error:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'HTML processing error' });
        }
      });
      
    } else {
      console.log(`📦 Streaming ${contentType} response directly (${response.headers['content-length'] || 'unknown size'})...`);
      
      // Stream non-HTML responses directly (CSS, JS, images, etc.)
      res.status(response.status);
      response.data.pipe(res);
      
      response.data.on('end', () => {
        console.log(`✅ ${contentType} response streamed successfully`);
      });
      
      response.data.on('error', (error) => {
        console.error('❌ Asset stream error:', error);
      });
    }
    
  } catch (error) {
    console.error('❌ Proxy error:', error);
    console.error('❌ Error details:', {
      message: error.message,
      code: error.code,
      url: error.config?.url,
      status: error.response?.status,
      responseHeaders: error.response?.headers
    });
    
    if (!res.headersSent) {
      res.status(502).json({
        error: 'Proxy Error',
        message: error.message,
        details: error.code || 'Unknown error',
        targetUrl: error.config?.url || 'Unknown',
        timestamp: new Date().toISOString()
      });
    }
  }
});

// Test tool connectivity
router.post('/tools/:toolId/test', async (req, res) => {
  try {
    const { toolId } = req.params;
    console.log(`🧪 Testing tool: ${toolId}`);
    
    const db = require('./database-config');
    const result = await db.query('SELECT setting_value FROM settings WHERE setting_key = ?', ['management_tools']);
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'No management tools configured' });
    }
    
    let tools = [];
    try {
      const toolsData = JSON.parse(result[0].setting_value);
      tools = Array.isArray(toolsData) ? toolsData : Object.values(toolsData);
    } catch (parseError) {
      return res.status(500).json({ error: 'Invalid tools configuration' });
    }
    
    const tool = tools.find(t => t.id === toolId);
    if (!tool) {
      return res.status(404).json({ error: 'Tool not found' });
    }
    
    const startTime = Date.now();
    
    try {
      const testOptions = {
        method: 'GET',
        url: tool.url,
        timeout: 10000,
        validateStatus: () => true,
        headers: {
          'User-Agent': 'JohnsonFlix-Manager/1.0'
        }
      };
      
      if (tool.username && tool.password) {
        testOptions.auth = {
          username: tool.username,
          password: tool.password
        };
      }
      
      const response = await axios(testOptions);
      const responseTime = Date.now() - startTime;
      
      const testResult = {
        success: response.status < 500,
        status: response.status,
        statusText: response.statusText,
        responseTime: `${responseTime}ms`,
        url: tool.url,
        accessible: response.status >= 200 && response.status < 400,
        supportsIframe: !response.headers['x-frame-options'],
        timestamp: new Date().toISOString()
      };
      
      console.log(`🧪 Test result:`, testResult);
      res.json(testResult);
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      res.json({
        success: false,
        error: error.message,
        code: error.code,
        responseTime: `${responseTime}ms`,
        url: tool.url,
        accessible: false,
        timestamp: new Date().toISOString()
      });
    }
    
  } catch (error) {
    console.error('Error testing tool connectivity:', error);
    res.status(500).json({ error: 'Failed to test tool connectivity' });
  }
});

module.exports = router;