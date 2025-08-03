// routes-management.js - WORKING VERSION WITH MANUAL PATH PARSING
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

// PROXY HANDLER - Catch everything that starts with /tools/*/proxy
router.all('*', async (req, res, next) => {
  // Check if this is a proxy request by examining the URL
  const urlPath = req.originalUrl.replace('/api/management', '');
  const proxyMatch = urlPath.match(/^\/tools\/([^\/]+)\/proxy(.*)$/);
  
  if (!proxyMatch) {
    // Not a proxy request, continue to next handler
    return next();
  }
  
  try {
    const toolId = proxyMatch[1];
    const subPath = proxyMatch[2] || '';
    const queryString = req.originalUrl.includes('?') ? req.originalUrl.split('?')[1] : '';
    
    console.log(`🔗 PROXY REQUEST DETECTED:`);
    console.log(`   Full URL: ${req.originalUrl}`);
    console.log(`   URL Path: ${urlPath}`);
    console.log(`   Tool ID: ${toolId}`);
    console.log(`   Sub Path: "${subPath}"`);
    console.log(`   Query String: "${queryString}"`);
    console.log(`   Method: ${req.method}`);
    
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
    
    console.log(`🎯 Target URL: ${targetUrl}`);
    
    // Prepare request options
    const requestOptions = {
      method: req.method,
      url: targetUrl,
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (compatible)',
        'Accept': req.headers['accept'] || '*/*',
        'Accept-Language': req.headers['accept-language'] || 'en-US,en;q=0.9',
        'Accept-Encoding': req.headers['accept-encoding'] || 'gzip, deflate',
        'Referer': tool.url,
        'Host': new URL(tool.url).host
      },
      timeout: 30000,
      validateStatus: () => true,
      responseType: 'stream',
      maxRedirects: 5
    };
    
    // Clean up headers that can cause issues
    delete requestOptions.headers['host'];
    delete requestOptions.headers['connection'];
    delete requestOptions.headers['content-length'];
    
    // Add authentication if provided
    if (tool.username && tool.password) {
      requestOptions.auth = {
        username: tool.username,
        password: tool.password
      };
      console.log(`🔐 Using authentication for ${tool.username}`);
    }
    
    // Add request body for POST/PUT requests
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      requestOptions.data = req;
    }
    
    console.log(`🚀 Making request to ${targetUrl}...`);
    
    // Make the request
    const response = await axios(requestOptions);
    
    console.log(`📥 Response: ${response.status} ${response.statusText}`);
    console.log(`📦 Content-Type: ${response.headers['content-type']}`);
    
    // Handle the response
    const contentType = response.headers['content-type'] || '';
    
    // Copy all response headers except problematic ones
    Object.keys(response.headers).forEach(key => {
      const lowerKey = key.toLowerCase();
      if (!['connection', 'content-encoding', 'transfer-encoding', 'content-length', 'x-frame-options', 'content-security-policy'].includes(lowerKey)) {
        res.set(key, response.headers[key]);
      }
    });
    
    // Add iframe-friendly headers
    res.set('X-Frame-Options', 'ALLOWALL');
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
    
    if (contentType.includes('text/html')) {
      console.log('📄 Processing HTML response...');
      
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
          .replace(/url\('\/([^']*?)'\)/g, `url('${baseProxyPath}/$1')`);
        
        res.set('Content-Length', Buffer.byteLength(htmlContent));
        res.status(response.status).send(htmlContent);
        console.log(`✅ HTML response sent successfully`);
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