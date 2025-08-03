// routes-management.js - SIMPLE WORKING PROXY VERSION
const express = require('express');
const axios = require('axios');
const router = express.Router();

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

// Simple proxy that handles all requests manually
router.all('/proxy/:toolId/*', async (req, res) => {
  try {
    const { toolId } = req.params;
    const proxyPath = req.params[0] || '';
    
    // Get tool configuration
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
    
    // Check if tool supports iframe access
    if (tool.access_type !== 'iframe' && tool.access_type !== 'both') {
      return res.status(403).json({ error: 'Tool does not support iframe access' });
    }
    
    // Build target URL
    let targetUrl = tool.url;
    if (proxyPath) {
      // Remove trailing slash from tool.url and ensure proxyPath starts with /
      targetUrl = tool.url.replace(/\/$/, '') + '/' + proxyPath.replace(/^\//, '');
    }
    
    console.log(`🔗 Proxying ${req.method} ${req.originalUrl} -> ${targetUrl}`);
    
    // Prepare request options
    const requestOptions = {
      method: req.method,
      url: targetUrl,
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (compatible)',
        'Accept': req.headers['accept'] || '*/*',
        'Accept-Language': req.headers['accept-language'] || 'en-US,en;q=0.9',
        'Accept-Encoding': req.headers['accept-encoding'] || 'gzip, deflate',
        'Host': new URL(tool.url).host,
        // Don't set X-Forwarded headers that might trigger auth
        // 'X-Forwarded-Host': req.get('host'),
        // 'X-Forwarded-Proto': req.protocol,
        // 'X-Forwarded-For': req.ip
      },
      timeout: 30000,
      validateStatus: () => true, // Accept all status codes
      responseType: 'stream', // Stream the response
      maxRedirects: 5
    };
    
    // Remove headers that might cause issues
    delete requestOptions.headers['host'];
    delete requestOptions.headers['connection'];
    delete requestOptions.headers['content-length'];
    
    // Add authentication if provided
    if (tool.username && tool.password) {
      requestOptions.auth = {
        username: tool.username,
        password: tool.password
      };
    }
    
    // Add request body for POST/PUT requests
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      requestOptions.data = req;
    }
    
    // Make the request
    const response = await axios(requestOptions);
    
    // Handle HTML responses - rewrite asset paths for iframe compatibility
    const contentType = response.headers['content-type'] || '';
    if (contentType.includes('text/html')) {
      // Convert stream to string for HTML processing
      let htmlContent = '';
      response.data.on('data', chunk => {
        htmlContent += chunk.toString();
      });
      
      response.data.on('end', () => {
        // Use base tag injection for cleaner path handling
        const baseProxyPath = `/api/management/proxy/${toolId}/`;
        
        // Inject base tag to handle relative paths automatically
        if (htmlContent.includes('<head>')) {
          htmlContent = htmlContent.replace(
            '<head>', 
            `<head><base href="${baseProxyPath}">`
          );
        } else if (htmlContent.includes('<html>')) {
          htmlContent = htmlContent.replace(
            '<html>', 
            `<html><head><base href="${baseProxyPath}"></head>`
          );
        }
        
        // Also remove any existing base tags that might conflict
        htmlContent = htmlContent.replace(/<base\s+href="[^"]*"[^>]*>/gi, '');
        
        // Set response headers
        Object.keys(response.headers).forEach(key => {
          if (!['connection', 'content-encoding', 'transfer-encoding', 'content-length'].includes(key.toLowerCase())) {
            res.set(key, response.headers[key]);
          }
        });
        
        // Remove/modify headers that prevent iframe embedding
        res.removeHeader('X-Frame-Options');
        res.removeHeader('Content-Security-Policy');
        res.removeHeader('Content-Security-Policy-Report-Only');
        
        // Add headers to allow iframe embedding
        res.set('X-Frame-Options', 'ALLOWALL');
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
        res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
        res.set('Content-Length', Buffer.byteLength(htmlContent));
        
        res.status(response.status).send(htmlContent);
        console.log(`✅ HTML Proxy response: ${response.status} for ${req.originalUrl} (${htmlContent.length} bytes)`);
        console.log(`🔍 First 200 chars of HTML:`, htmlContent.substring(0, 200));
      });
      
    } else {
      // For non-HTML responses (CSS, JS, images, etc.), stream directly
      Object.keys(response.headers).forEach(key => {
        if (!['connection', 'content-encoding', 'transfer-encoding'].includes(key.toLowerCase())) {
          res.set(key, response.headers[key]);
        }
      });
      
      // Remove iframe-blocking headers for all responses
      res.removeHeader('X-Frame-Options');
      res.removeHeader('Content-Security-Policy');
      res.removeHeader('Content-Security-Policy-Report-Only');
      
      // Add iframe-friendly headers
      res.set('Access-Control-Allow-Origin', '*');
      
      res.status(response.status);
      response.data.pipe(res);
      console.log(`✅ Asset Proxy response: ${response.status} for ${req.originalUrl}`);
    }
    
  } catch (error) {
    console.error('❌ Proxy error:', error.message);
    
    if (!res.headersSent) {
      res.status(502).json({
        error: 'Proxy Error',
        message: 'Failed to connect to the target service',
        details: error.code || error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
});

// Test tool connectivity
router.post('/tools/:toolId/test', async (req, res) => {
  try {
    const { toolId } = req.params;
    
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
        supportsIframe: !response.headers['x-frame-options'] && !response.headers['content-security-policy'],
        timestamp: new Date().toISOString()
      };
      
      console.log(`🧪 Test result for ${tool.name}:`, testResult);
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

// Get proxy status
router.get('/proxy/status', (req, res) => {
  try {
    const proxyStats = {
      type: 'Simple axios-based proxy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      features: {
        iframe: true,
        streaming: true,
        authentication: true
      }
    };
    
    res.json(proxyStats);
  } catch (error) {
    console.error('Error getting proxy status:', error);
    res.status(500).json({ error: 'Failed to get proxy status' });
  }
});

module.exports = router;