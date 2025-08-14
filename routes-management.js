// routes-management.js - Debug version with extensive logging
const express = require('express');
const axios = require('axios');
const router = express.Router();

// Debug middleware - ENHANCED LOGGING
router.use((req, res, next) => {
  console.log(`🔍 [MANAGEMENT] ${req.method} ${req.originalUrl}`);
  console.log(`🔍 [MANAGEMENT] Headers:`, Object.keys(req.headers));
  console.log(`🔍 [MANAGEMENT] User-Agent:`, req.headers['user-agent']?.substring(0, 50));
  next();
});

// Get all management tools
router.get('/tools', async (req, res) => {
  console.log('📦 [TOOLS] Getting all tools...');
  try {
    const db = require('./database-config');
    const result = await db.query('SELECT setting_value FROM settings WHERE setting_key = ?', ['management_tools']);
    
    let tools = [];
    if (result.length > 0) {
      try {
        const toolsData = JSON.parse(result[0].setting_value);
        tools = Array.isArray(toolsData) ? toolsData : Object.values(toolsData);
        console.log(`📦 [TOOLS] Found ${tools.length} tools:`, tools.map(t => ({ id: t.id, name: t.name, url: t.url })));
      } catch (parseError) {
        console.error('❌ [TOOLS] Error parsing tools data:', parseError);
      }
    } else {
      console.log('📦 [TOOLS] No tools found in database');
    }
    
    res.json({ tools });
  } catch (error) {
    console.error('❌ [TOOLS] Error fetching tools:', error);
    res.status(500).json({ error: 'Failed to fetch management tools' });
  }
});

// Save tools
router.post('/tools', async (req, res) => {
  console.log('💾 [TOOLS] Saving tools...');
  try {
    const { tools } = req.body;
    console.log(`💾 [TOOLS] Saving ${tools?.length} tools`);
    
    if (!Array.isArray(tools)) {
      return res.status(400).json({ error: 'Tools must be an array' });
    }
    
    const db = require('./database-config');
    await db.query(`
      INSERT INTO settings (setting_key, setting_value, setting_type)
      VALUES ('management_tools', ?, 'json')
      ON DUPLICATE KEY UPDATE setting_value = ?, setting_type = 'json'
    `, [JSON.stringify(tools), JSON.stringify(tools)]);
    
    console.log('✅ [TOOLS] Tools saved successfully');
    res.json({ message: 'Management tools saved successfully' });
  } catch (error) {
    console.error('❌ [TOOLS] Error saving tools:', error);
    res.status(500).json({ error: 'Failed to save management tools' });
  }
});

// PROXY ROUTE - ENHANCED FOR RADARR/SONARR COMPATIBILITY
router.all('/tools/:toolId/proxy*', async (req, res) => {
  const toolId = req.params.toolId;
  const subPath = req.params[0] || '';
  
  console.log('🔗 [PROXY] =====================================');
  console.log(`🔗 [PROXY] Request: ${req.method} ${req.originalUrl}`);
  console.log(`🔗 [PROXY] Tool ID: ${toolId}`);
  console.log(`🔗 [PROXY] Sub Path: "${subPath}"`);
  console.log(`🔗 [PROXY] Query: ${JSON.stringify(req.query)}`);
  
  try {
    // Get tool configuration
    const db = require('./database-config');
    const result = await db.query('SELECT setting_value FROM settings WHERE setting_key = ?', ['management_tools']);
    
    if (result.length === 0) {
      console.error('❌ [PROXY] No management tools in database');
      return res.status(404).json({ error: 'No management tools configured' });
    }
    
    let tools = [];
    try {
      const toolsData = JSON.parse(result[0].setting_value);
      tools = Array.isArray(toolsData) ? toolsData : Object.values(toolsData);
      console.log(`🔍 [PROXY] Found ${tools.length} tools in database`);
      console.log(`🔍 [PROXY] Available tool IDs:`, tools.map(t => t.id));
    } catch (parseError) {
      console.error('❌ [PROXY] Error parsing tools data:', parseError);
      return res.status(500).json({ error: 'Invalid tools configuration' });
    }
    
    const tool = tools.find(t => t.id === toolId);
    if (!tool) {
      console.error(`❌ [PROXY] Tool '${toolId}' not found`);
      console.error(`❌ [PROXY] Available tools:`, tools.map(t => ({ id: t.id, name: t.name })));
      return res.status(404).json({ 
        error: 'Tool not found', 
        toolId, 
        availableTools: tools.map(t => ({ id: t.id, name: t.name }))
      });
    }
    
    console.log(`✅ [PROXY] Found tool: ${tool.name}`);
    console.log(`✅ [PROXY] Tool URL: ${tool.url}`);
    
    // Build target URL
    let targetUrl = tool.url;
    if (targetUrl.endsWith('/')) {
      targetUrl = targetUrl.slice(0, -1);
    }
    
    if (subPath) {
      if (!subPath.startsWith('/')) {
        targetUrl += '/';
      }
      targetUrl += subPath;
    }
    
    // Add query parameters
    const queryString = new URLSearchParams(req.query).toString();
    if (queryString) {
      targetUrl += (targetUrl.includes('?') ? '&' : '?') + queryString;
    }
    
    console.log(`🎯 [PROXY] Target URL: ${targetUrl}`);
    
    // Get original host and protocol
    const originalHost = req.get('host');
    const originalProto = req.get('x-forwarded-proto') || req.protocol;
    const proxyBase = `/api/management/tools/${toolId}/proxy`;
    
    // Prepare headers with proper reverse proxy headers for *arr apps
    const headers = {
      'Host': originalHost, // Critical for *arr apps
      'X-Real-IP': req.ip || req.connection.remoteAddress,
      'X-Forwarded-For': req.get('x-forwarded-for') || req.ip || req.connection.remoteAddress,
      'X-Forwarded-Proto': originalProto,
      'X-Forwarded-Host': originalHost,
      'X-Forwarded-Port': originalProto === 'https' ? '443' : '80',
      'User-Agent': req.headers['user-agent'] || 'JohnsonFlix-Management-Proxy',
      'Accept': req.headers['accept'] || '*/*',
      'Accept-Language': req.headers['accept-language'] || 'en-US,en;q=0.9',
      'Accept-Encoding': 'identity', // Disable compression for easier processing
    };
    
    // Add authentication if configured
    if (tool.username && tool.password) {
      const auth = Buffer.from(`${tool.username}:${tool.password}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
      console.log(`🔐 [PROXY] Added basic auth for ${tool.username}`);
    }
    
    if (tool.api_key) {
      headers['X-API-Key'] = tool.api_key;
      console.log(`🔑 [PROXY] Added API key`);
    }
    
    console.log(`📤 [PROXY] Request headers:`, Object.keys(headers));
    
    // Make the request
    const axiosConfig = {
      method: req.method,
      url: targetUrl,
      headers: headers,
      timeout: 30000,
      validateStatus: () => true, // Don't throw on any status code
      responseType: 'stream'
    };
    
    // Add body for POST/PUT requests
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      axiosConfig.data = req.body;
      headers['Content-Type'] = req.headers['content-type'] || 'application/json';
    }
    
    console.log(`🚀 [PROXY] Making ${req.method} request to ${targetUrl}`);
    
    const response = await axios(axiosConfig);
    
    console.log(`📥 [PROXY] Response status: ${response.status} ${response.statusText}`);
    console.log(`📥 [PROXY] Response headers:`, Object.keys(response.headers));
    console.log(`📥 [PROXY] Content-Type: ${response.headers['content-type']}`);
    
    // Set response status
    res.status(response.status);
    
    // Copy headers (except problematic ones)
    Object.keys(response.headers).forEach(key => {
      const lowerKey = key.toLowerCase();
      if (!['connection', 'content-encoding', 'transfer-encoding', 'content-length'].includes(lowerKey)) {
        res.set(key, response.headers[key]);
      }
    });
    
    // Critical: Remove iframe blocking headers
    res.removeHeader('x-frame-options');
    res.removeHeader('X-Frame-Options');
    res.removeHeader('content-security-policy');
    res.removeHeader('Content-Security-Policy');
    
    // Add iframe-friendly headers
    res.set('X-Frame-Options', 'ALLOWALL');
    
    // If this is an HTML response, we need to rewrite URLs
    const contentType = response.headers['content-type'] || '';
    if (contentType.includes('text/html')) {
      console.log(`📄 [PROXY] Processing HTML response for URL rewriting...`);
      
      let htmlContent = '';
      response.data.on('data', chunk => {
        htmlContent += chunk.toString();
      });
      
      response.data.on('end', () => {
        console.log(`📝 [PROXY] HTML Content length: ${htmlContent.length} chars`);
        
        // Rewrite URLs in HTML for *arr apps
        const proxyBasePath = `/api/management/tools/${toolId}/proxy`;
        const toolOrigin = new URL(tool.url).origin;
        
        console.log(`🔧 [PROXY] Rewriting URLs with base: ${proxyBasePath}`);
        
        // Enhanced URL rewriting for *arr applications
        htmlContent = htmlContent
          // Fix absolute URLs that start with /
          .replace(/href="\/([^"]*?)"/g, `href="${proxyBasePath}/$1"`)
          .replace(/src="\/([^"]*?)"/g, `src="${proxyBasePath}/$1"`)
          .replace(/action="\/([^"]*?)"/g, `action="${proxyBasePath}/$1"`)
          
          // Fix URLs in CSS
          .replace(/url\(\/([^)]*?)\)/g, `url(${proxyBasePath}/$1)`)
          .replace(/url\("\/([^"]*?)"\)/g, `url("${proxyBasePath}/$1")`)
          .replace(/url\('\/([^']*?)'\)/g, `url('${proxyBasePath}/$1')`)
          
          // Fix JavaScript URLs
          .replace(/fetch\s*\(\s*['"`]\/([^'"`]*?)['"`]/g, `fetch('${proxyBasePath}/$1'`)
          .replace(/ajax\s*\(\s*['"`]\/([^'"`]*?)['"`]/g, `ajax('${proxyBasePath}/$1'`)
          .replace(/XMLHttpRequest.*open\s*\(\s*['"`]GET['"`]\s*,\s*['"`]\/([^'"`]*?)['"`]/g, 
            `XMLHttpRequest().open('GET', '${proxyBasePath}/$1'`)
          
          // Fix location changes
          .replace(/window\.location\s*=\s*['"`]\/([^'"`]*?)['"`]/g, `window.location = '${proxyBasePath}/$1'`)
          .replace(/location\.href\s*=\s*['"`]\/([^'"`]*?)['"`]/g, `location.href = '${proxyBasePath}/$1'`)
          
          // Fix base tag if present
          .replace(/<base\s+href\s*=\s*['"`]([^'"`]*?)['"`]/gi, `<base href="${proxyBasePath}/"`)
          
          // Add script to fix *arr app URLs dynamically
          .replace(/<head>/gi, `<head>
            <script>
              // Fix *arr app base URL for proxy
              (function() {
                console.log('🔧 Fixing ${tool.name} URLs for proxy mode...');
                
                // Override common *arr functions that build URLs
                const originalLocation = window.location;
                const proxyBase = '${proxyBasePath}';
                
                // Fix any hardcoded URL builders
                if (window.Sonarr || window.Radarr || window.Lidarr || window.Prowlarr) {
                  const app = window.Sonarr || window.Radarr || window.Lidarr || window.Prowlarr;
                  if (app && app.Config) {
                    app.Config.urlBase = proxyBase;
                    console.log('🔧 Set urlBase to:', proxyBase);
                  }
                }
                
                // Override fetch to fix relative URLs
                const originalFetch = window.fetch;
                window.fetch = function(url, options) {
                  if (typeof url === 'string' && url.startsWith('/') && !url.startsWith(proxyBase)) {
                    url = proxyBase + url;
                    console.log('🔧 Fixed fetch URL to:', url);
                  }
                  return originalFetch.call(this, url, options);
                };
                
                // Set a global variable that *arr apps can use
                window.__proxyBase = proxyBase;
              })();
            </script>`)
          
          // Add final script at end of body
          .replace(/<\/body>/gi, `
            <script>
              console.log('✅ ${tool.name} proxy setup complete');
              console.log('🔧 Proxy base path:', '${proxyBasePath}');
            </script>
          </body>`);
        
        res.send(htmlContent);
        console.log(`✅ [PROXY] HTML response processed and sent`);
      });
      
      response.data.on('error', (error) => {
        console.error(`❌ [PROXY] HTML processing error:`, error.message);
        if (!res.headersSent) {
          res.status(500).json({ error: 'HTML processing error' });
        }
      });
    } else {
      console.log(`✅ [PROXY] Streaming non-HTML response...`);
      
      // Stream the response for non-HTML content
      response.data.pipe(res);
      
      response.data.on('end', () => {
        console.log(`✅ [PROXY] Response completed for ${tool.name}`);
      });
      
      response.data.on('error', (error) => {
        console.error(`❌ [PROXY] Stream error:`, error.message);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Proxy stream error' });
        }
      });
    }
    
  } catch (error) {
    console.error(`❌ [PROXY] Error:`, error.message);
    console.error(`❌ [PROXY] Error details:`, {
      code: error.code,
      response: error.response?.status,
      responseData: error.response?.data?.toString?.().substring(0, 200)
    });
    
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Proxy request failed',
        details: error.message,
        code: error.code,
        suggestion: error.code === 'ECONNREFUSED' ? 'Check if the tool is running and accessible' : 'Check tool configuration'
      });
    }
  }
});

// Test proxy connectivity
router.get('/tools/:toolId/test', async (req, res) => {
  const toolId = req.params.toolId;
  console.log(`🧪 [TEST] Testing connectivity to tool: ${toolId}`);
  
  try {
    const db = require('./database-config');
    const result = await db.query('SELECT setting_value FROM settings WHERE setting_key = ?', ['management_tools']);
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'No tools configured' });
    }
    
    const tools = JSON.parse(result[0].setting_value);
    const tool = (Array.isArray(tools) ? tools : Object.values(tools)).find(t => t.id === toolId);
    
    if (!tool) {
      return res.status(404).json({ error: 'Tool not found' });
    }
    
    console.log(`🧪 [TEST] Testing ${tool.name} at ${tool.url}`);
    
    const startTime = Date.now();
    const testResponse = await axios.get(tool.url, {
      timeout: 5000,
      validateStatus: () => true
    });
    const responseTime = Date.now() - startTime;
    
    console.log(`🧪 [TEST] Response: ${testResponse.status} in ${responseTime}ms`);
    
    res.json({
      tool: { id: tool.id, name: tool.name, url: tool.url },
      status: testResponse.status,
      statusText: testResponse.statusText,
      responseTime: responseTime,
      reachable: testResponse.status < 500,
      headers: Object.keys(testResponse.headers)
    });
    
  } catch (error) {
    console.error(`❌ [TEST] Test failed:`, error.message);
    res.json({
      tool: { id: toolId },
      error: error.message,
      code: error.code,
      reachable: false
    });
  }
});

module.exports = router;