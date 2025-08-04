// routes-management.js - WORKING VERSION WITH MANUAL PATH PARSING
const express = require('express');
const axios = require('axios');
const router = express.Router();
const toolSessions = new Map();

// Debug middleware
router.use((req, res, next) => {
  console.log(`?? Management Route: ${req.method} ${req.originalUrl}`);
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


// UNIVERSAL IFRAME PROXY - REPLACE ENTIRE PROXY SECTION
// This handles ANY website, not just IPTV panels

// PROXY HANDLER - Universal approach
router.all('*', async (req, res, next) => {
  const urlPath = req.originalUrl.replace('/api/management', '');
  const proxyMatch = urlPath.match(/^\/tools\/([^\/]+)\/proxy(.*)$/);
  
  if (!proxyMatch) {
    return next();
  }
  
  try {
    const toolId = proxyMatch[1];
    const subPath = proxyMatch[2] || '';
    const queryString = req.originalUrl.includes('?') ? req.originalUrl.split('?')[1] : '';
    
    console.log(`🔗 UNIVERSAL PROXY: ${req.method} ${req.originalUrl}`);
    
    // Get tool configuration
    const db = require('./database-config');
    const result = await db.query('SELECT setting_value FROM settings WHERE setting_key = ?', ['management_tools']);
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'No management tools configured' });
    }
    
    const toolsData = JSON.parse(result[0].setting_value);
    const tools = Array.isArray(toolsData) ? toolsData : Object.values(toolsData);
    const tool = tools.find(t => t.id === toolId);
    
    if (!tool) {
      return res.status(404).json({ error: 'Tool not found' });
    }
    
    // Build target URL - UNIVERSAL METHOD
    let targetUrl;
    const parsedToolUrl = new URL(tool.url);
    
    if (subPath) {
      // For assets and sub-pages, use base domain + path
      targetUrl = `${parsedToolUrl.protocol}//${parsedToolUrl.host}${subPath}`;
    } else {
      // For main page
      targetUrl = tool.url;
    }
    
    if (queryString) {
      targetUrl += (targetUrl.includes('?') ? '&' : '?') + queryString;
    }
    
    console.log(`🎯 Proxying to: ${targetUrl}`);
    
    // UNIVERSAL REQUEST SETUP - Works with any website
    const proxyOptions = {
      method: req.method,
      url: targetUrl,
      headers: {
        ...req.headers,
        'host': parsedToolUrl.host,
        'origin': parsedToolUrl.origin,
        'referer': parsedToolUrl.origin
      },
      timeout: 30000,
      validateStatus: () => true,
      responseType: 'stream',
      maxRedirects: 0 // Handle redirects manually
    };
    
    // Remove problematic headers
    delete proxyOptions.headers['host'];
    delete proxyOptions.headers['x-forwarded-for'];
    delete proxyOptions.headers['x-forwarded-proto'];
    delete proxyOptions.headers['x-real-ip'];
    
    // Add basic auth if provided
    if (tool.username && tool.password) {
      proxyOptions.auth = {
        username: tool.username,
        password: tool.password
      };
    }
    
    // Handle request body for POST/PUT requests
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      console.log('📝 Processing request body...');
      
      return new Promise((resolve, reject) => {
        const chunks = [];
        
req.on('data', chunk => {
          console.log(`📋 Received chunk: ${chunk.length} bytes`);
          chunks.push(chunk);
        });
        
        req.on('end', async () => {
          console.log('📋 Request body end event triggered');
          try {
            if (chunks.length > 0) {
              proxyOptions.data = Buffer.concat(chunks);
              console.log(`📋 Body size: ${proxyOptions.data.length} bytes`);
            }
            
            const response = await axios(proxyOptions);
            handleResponse(response, res, toolId, parsedToolUrl);
            resolve();
          } catch (error) {
            console.error('❌ Request error:', error.message);
            if (!res.headersSent) {
              res.status(502).json({ error: 'Proxy error', details: error.message });
            }
            resolve();
          }
        });
        
        req.on('error', error => {
          console.error('❌ Request stream error:', error);
          if (!res.headersSent) {
            res.status(400).json({ error: 'Request error' });
          }
          resolve();
        });
      });
    }
    
    // For GET requests
    const response = await axios(proxyOptions);
    handleResponse(response, res, toolId, parsedToolUrl);
    
  } catch (error) {
    console.error('❌ Proxy error:', error.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Proxy error', details: error.message });
    }
  }
});

// UNIVERSAL RESPONSE HANDLER
function handleResponse(response, res, toolId, parsedToolUrl) {
  console.log(`📥 Response: ${response.status} ${response.statusText}`);
  
  const contentType = response.headers['content-type'] || '';
  
  // Copy headers but make iframe-friendly
  Object.keys(response.headers).forEach(key => {
    const lowerKey = key.toLowerCase();
    if (!['connection', 'content-encoding', 'transfer-encoding', 'content-length'].includes(lowerKey)) {
      if (lowerKey === 'x-frame-options') {
        res.set('X-Frame-Options', 'ALLOWALL');
      } else if (lowerKey === 'content-security-policy') {
        // Remove CSP that blocks iframes
        const csp = response.headers[key].replace(/frame-ancestors[^;]+;?/gi, '');
        if (csp.trim()) res.set(key, csp);
      } else {
        res.set(key, response.headers[key]);
      }
    }
  });
  
  // Add iframe-friendly headers
  res.set('X-Frame-Options', 'ALLOWALL');
  res.set('Access-Control-Allow-Origin', '*');
  
  // Handle redirects
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers['location'];
    if (location) {
      console.log(`🔄 Redirect to: ${location}`);
      
      let proxyRedirect;
      if (location.startsWith('/')) {
        // Relative redirect
        proxyRedirect = `/api/management/tools/${toolId}/proxy${location}`;
      } else if (location.includes(parsedToolUrl.host)) {
        // Same domain redirect
        const path = location.replace(parsedToolUrl.origin, '');
        proxyRedirect = `/api/management/tools/${toolId}/proxy${path}`;
      } else {
        // External redirect - allow it
        proxyRedirect = location;
      }
      
      res.set('Location', proxyRedirect);
      res.status(response.status).end();
      return;
    }
  }
  
  // Handle HTML content
  if (contentType.includes('text/html')) {
    console.log('📄 Processing HTML...');
    
    let htmlContent = '';
    response.data.on('data', chunk => {
      htmlContent += chunk.toString();
    });
    
    response.data.on('end', () => {
      // URL rewriting for iframe compatibility
      const baseProxyPath = `/api/management/tools/${toolId}/proxy`;
      const toolOrigin = parsedToolUrl.origin;
      
      // Replace URLs to go through proxy
      htmlContent = htmlContent
        // Relative URLs
        .replace(/href="\/([^"]*?)"/g, `href="${baseProxyPath}/$1"`)
        .replace(/src="\/([^"]*?)"/g, `src="${baseProxyPath}/$1"`)
        .replace(/action="\/([^"]*?)"/g, `action="${baseProxyPath}/$1"`)
        .replace(/href='\/([^']*?)'/g, `href='${baseProxyPath}/$1'`)
        .replace(/src='\/([^']*?)'/g, `src='${baseProxyPath}/$1'`)
        .replace(/action='\/([^']*?)'/g, `action='${baseProxyPath}/$1'`)
        // CSS URLs
        .replace(/url\(\/([^)]*?)\)/g, `url(${baseProxyPath}/$1)`)
        .replace(/url\("\/([^"]*?)"\)/g, `url("${baseProxyPath}/$1")`)
        .replace(/url\('\/([^']*?)'\)/g, `url('${baseProxyPath}/$1')`)
        // Absolute URLs to same domain
        .replace(new RegExp(`href="${toolOrigin}([^"]*?)"`, 'g'), `href="${baseProxyPath}$1"`)
        .replace(new RegExp(`src="${toolOrigin}([^"]*?)"`, 'g'), `src="${baseProxyPath}$1"`)
        .replace(new RegExp(`action="${toolOrigin}([^"]*?)"`, 'g'), `action="${baseProxyPath}$1"`)
// Remove frame-busting scripts and inject form interceptor
        .replace(/if\s*\(\s*top\s*[!=]=\s*self\s*\)/gi, 'if(false)')
        .replace(/if\s*\(\s*self\s*[!=]==\s*top\s*\)/gi, 'if(false)')
        .replace(/top\.location\s*=\s*self\.location/gi, '// removed frame buster')
        .replace(/parent\.location\s*=\s*self\.location/gi, '// removed frame buster')
        .replace(/<\/body>/gi, '<script>console.log("🔥 JohnsonFlix iframe proxy loaded");document.addEventListener("submit", function(e) {console.log("🔥 Form submission intercepted:", e.target);e.preventDefault();const form = e.target;const formData = new FormData(form);const params = new URLSearchParams(formData);console.log("📋 Form data:", params.toString());const submitUrl = form.action || window.location.href;console.log("🎯 Submitting to:", submitUrl);const controller = new AbortController();const timeoutId = setTimeout(() => {controller.abort();console.log("⏰ Fetch timeout - reloading page");window.location.reload();}, 3000);fetch(submitUrl, {method: form.method || "POST",headers: {"Content-Type": "application/x-www-form-urlencoded"},body: params.toString(),redirect: "manual",signal: controller.signal}).then(response => {clearTimeout(timeoutId);console.log("📥 Form response:", response.status, response.statusText);window.location.reload();}).catch(error => {clearTimeout(timeoutId);console.log("❌ Fetch error or timeout:", error.name);window.location.reload();});});</script></body>');
		
      res.set('Content-Length', Buffer.byteLength(htmlContent));
      res.status(response.status).send(htmlContent);
      console.log(`✅ HTML sent (${htmlContent.length} chars)`);
    });
    
    response.data.on('error', error => {
      console.error('❌ HTML stream error:', error);
      if (!res.headersSent) {
        res.status(500).send('HTML processing error');
      }
    });
    
  } else {
    // Stream non-HTML content directly
    console.log(`📦 Streaming ${contentType}...`);
    res.status(response.status);
    response.data.pipe(res);
    
    response.data.on('error', error => {
      console.error('❌ Stream error:', error);
    });
  }
}

// Clean up old sessions periodically (every 30 minutes)
setInterval(() => {
  const thirtyMinutesAgo = Date.now() - (30 * 60 * 1000);
  for (const [toolId, session] of toolSessions.entries()) {
    if (session.lastActivity < thirtyMinutesAgo) {
      toolSessions.delete(toolId);
      console.log(`🧹 Cleaned up inactive session for tool: ${toolId}`);
    }
  }
}, 30 * 60 * 1000);

// Test tool connectivity
router.post('/tools/:toolId/test', async (req, res) => {
  try {
    const { toolId } = req.params;
    console.log(`?? Testing tool: ${toolId}`);
    
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
      
      console.log(`?? Test result:`, testResult);
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