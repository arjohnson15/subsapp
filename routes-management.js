// routes-management.js - FIXED VERSION WITH IMPROVED IFRAME PROXY
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

// UNIVERSAL PROXY HANDLER - Catch everything that starts with /tools/*
router.all('*', async (req, res, next) => {
  // Check if this is a proxy request by examining the URL
  const urlPath = req.originalUrl.replace('/api/management', '');
  
  // Match both /proxy and /undefined patterns (to catch the webpack issue)
  const proxyMatch = urlPath.match(/^\/tools\/([^\/]+)\/(proxy|undefined)(.*)$/);
  
  if (!proxyMatch) {
    // Not a proxy request, continue to next handler
    return next();
  }
  
  // Handle the undefined route issue by treating it as proxy
  if (proxyMatch[2] === 'undefined') {
    console.log(`⚠️  WARNING: Intercepted 'undefined' route - converting to proxy`);
  }
  
  console.log(`🔗 UNIVERSAL PROXY: ${req.method} ${req.originalUrl}`);
  
  try {
    const toolId = proxyMatch[1];
    let subPath = proxyMatch[3] || '';
    const routeType = proxyMatch[2]; // 'proxy' or 'undefined'
    
    // Handle undefined routes - these are webpack chunks that lost their base path
    if (routeType === 'undefined') {
      console.log(`🔧 FIXING UNDEFINED ROUTE: Original subPath: "${subPath}"`);
      // For undefined routes, the subPath is actually the correct relative path
      // No modification needed - just log it
    }
    
    // Extract query string properly to avoid duplication
    let queryString = '';
    const questionMarkIndex = req.originalUrl.indexOf('?');
    if (questionMarkIndex !== -1) {
      queryString = req.originalUrl.substring(questionMarkIndex + 1);
      // Remove query string from subPath if it's there
      if (subPath.includes('?')) {
        subPath = subPath.split('?')[0];
      }
    }
    
    console.log(`🎯 Proxying to tool: ${toolId}, path: "${subPath}", routeType: "${routeType}"`);
    
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
      // Clean subPath - remove leading slash if present
      const cleanSubPath = subPath.startsWith('/') ? subPath.substring(1) : subPath;
      if (cleanSubPath) {
        targetUrl = targetUrl + '/' + cleanSubPath;
      }
    }
    
    // Add query parameters if they exist (avoid duplication)
    if (queryString) {
      targetUrl += '?' + queryString;
    }
    
    console.log(`🎯 Proxying to: ${targetUrl}`);
    
    // Forward cookies and headers from the original request
    const headers = {};
    
    // Copy important headers
    ['user-agent', 'accept', 'accept-language', 'accept-encoding', 'cache-control', 'pragma'].forEach(header => {
      if (req.headers[header]) {
        headers[header] = req.headers[header];
      }
    });
    
    // Forward cookies if they exist
    if (req.headers.cookie) {
      headers.cookie = req.headers.cookie;
      console.log(`🍪 Forwarding cookies from browser: ${req.headers.cookie.substring(0, 100)}...`);
    }
    
    // Add authentication if configured for the tool
    if (tool.username && tool.password) {
      console.log(`🔐 Using authentication for ${tool.username}`);
      const auth = Buffer.from(`${tool.username}:${tool.password}`).toString('base64');
      headers.authorization = `Basic ${auth}`;
    }
    
    // Set up axios request configuration
    const axiosConfig = {
      method: req.method.toLowerCase(),
      url: targetUrl,
      headers: headers,
      responseType: 'stream', // Important for binary content
      validateStatus: () => true, // Don't throw on HTTP errors
      timeout: 30000, // 30 second timeout
      maxRedirects: 0 // Handle redirects manually
    };
    
    // Forward request body for POST, PUT, PATCH requests
    if (['post', 'put', 'patch'].includes(req.method.toLowerCase()) && req.body) {
      if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
        axiosConfig.data = req.body;
        headers['content-type'] = 'application/json';
      } else {
        axiosConfig.data = req.body;
        if (req.headers['content-type']) {
          headers['content-type'] = req.headers['content-type'];
        }
      }
    }
    
    console.log(`🚀 Making request to ${targetUrl}...`);
    
    // Make the request
    const response = await axios(axiosConfig);
    
    console.log(`📡 Response: ${response.status} ${response.statusText}`);
    console.log(`📋 Content-Type: ${response.headers['content-type']}`);
    
    // Handle redirects
    if (response.status >= 300 && response.status < 400 && response.headers.location) {
      console.log(`🔄 Handling redirect to: ${response.headers.location}`);
      
      // Forward cookies from redirect response
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
        const toolOrigin = new URL(tool.url).origin;
        
        console.log(`🔧 Rewriting URLs with base: ${baseProxyPath}`);
        console.log(`🔧 Tool origin: ${toolOrigin}`);
        
        // More comprehensive URL rewriting
        htmlContent = htmlContent
          // Rewrite relative URLs
          .replace(/href="\/([^"]*?)"/g, `href="${baseProxyPath}/$1"`)
          .replace(/src="\/([^"]*?)"/g, `src="${baseProxyPath}/$1"`)
          .replace(/href='\/([^']*?)'/g, `href='${baseProxyPath}/$1'`)
          .replace(/src='\/([^']*?)'/g, `src='${baseProxyPath}/$1'`)
          
          // Rewrite CSS url() references
          .replace(/url\(\/([^)]*?)\)/g, `url(${baseProxyPath}/$1)`)
          .replace(/url\("\/([^"]*?)"\)/g, `url("${baseProxyPath}/$1")`)
          .replace(/url\('\/([^']*?)'\)/g, `url('${baseProxyPath}/$1')`)
          
          // Rewrite absolute URLs that match the tool's origin
          .replace(new RegExp(`href="${toolOrigin}([^"]*?)"`, 'g'), `href="${baseProxyPath}$1"`)
          .replace(new RegExp(`src="${toolOrigin}([^"]*?)"`, 'g'), `src="${baseProxyPath}$1"`)
          .replace(new RegExp(`href='${toolOrigin}([^']*?)'`, 'g'), `href='${baseProxyPath}$1'`)
          .replace(new RegExp(`src='${toolOrigin}([^']*?)'`, 'g'), `src='${baseProxyPath}$1'`)
          
          // Rewrite JavaScript fetch/XMLHttpRequest URLs
          .replace(/fetch\s*\(\s*['"`]\/([^'"`]*?)['"`]/g, `fetch('${baseProxyPath}/$1'`)
          .replace(/XMLHttpRequest.*open\s*\(\s*['"`]GET['"`]\s*,\s*['"`]\/([^'"`]*?)['"`]/g, 
            `XMLHttpRequest().open('GET', '${baseProxyPath}/$1'`)
          
          // Rewrite location and window.location references
          .replace(/window\.location\s*=\s*['"`]\/([^'"`]*?)['"`]/g, `window.location = '${baseProxyPath}/$1'`)
          .replace(/location\.href\s*=\s*['"`]\/([^'"`]*?)['"`]/g, `location.href = '${baseProxyPath}/$1'`)
          
          // Rewrite base tag if it exists
          .replace(/<base\s+href\s*=\s*['"`]([^'"`]*?)['"`]/gi, `<base href="${baseProxyPath}/"`)
          
          // Add iframe compatibility script
          .replace(/<head>/gi, `<head>
            <script>
              // Early webpack override - run before any other scripts
              (function() {
                const PROXY_BASE = '${baseProxyPath}';
                console.log('🔧 Early webpack override - setting public path to:', PROXY_BASE + '/');
                
                // Set webpack public path as early as possible
                if (typeof __webpack_public_path__ !== 'undefined') {
                  __webpack_public_path__ = PROXY_BASE + '/';
                }
                
                // Create a global override function
                window.__setWebpackPublicPath = function() {
                  if (typeof __webpack_require__ !== 'undefined') {
                    if (__webpack_require__.p !== undefined) {
                      console.log('🔧 Setting webpack require.p to:', PROXY_BASE + '/');
                      __webpack_require__.p = PROXY_BASE + '/';
                    }
                  }
                  
                  if (typeof __webpack_public_path__ !== 'undefined') {
                    console.log('🔧 Setting webpack public path to:', PROXY_BASE + '/');
                    __webpack_public_path__ = PROXY_BASE + '/';
                  }
                };
                
                // Call it immediately
                window.__setWebpackPublicPath();
                
                // Set up interval to keep overriding in case webpack resets it
                setInterval(window.__setWebpackPublicPath, 500);
              })();
            </script>`)
          .replace(/<\/head>/gi, `
            <script>
              console.log("🔗 JohnsonFlix iframe proxy loaded for ${tool.name}");
              
              // Store original functions and setup proxy environment
              (function() {
                const PROXY_BASE = '${baseProxyPath}';
                const TOOL_ORIGIN = '${toolOrigin}';
                
                // Override fetch to use proxy URLs
                const originalFetch = window.fetch;
                window.fetch = function(url, options = {}) {
                  if (typeof url === 'string') {
                    if (url.startsWith('/') && !url.includes('/api/management/tools/')) {
                      url = PROXY_BASE + url;
                      console.log('🔗 Proxying fetch request to:', url);
                    } else if (url.startsWith(TOOL_ORIGIN)) {
                      url = url.replace(TOOL_ORIGIN, PROXY_BASE);
                      console.log('🔗 Proxying absolute fetch request to:', url);
                    }
                  }
                  
                  // Ensure credentials are included for cross-origin requests
                  options.credentials = options.credentials || 'include';
                  options.mode = options.mode || 'cors';
                  
                  return originalFetch.call(this, url, options);
                };
                
                // Override XMLHttpRequest
                const OriginalXMLHttpRequest = window.XMLHttpRequest;
                window.XMLHttpRequest = function() {
                  const xhr = new OriginalXMLHttpRequest();
                  const originalOpen = xhr.open;
                  
                  xhr.open = function(method, url, ...args) {
                    if (typeof url === 'string') {
                      if (url.startsWith('/') && !url.includes('/api/management/tools/')) {
                        url = PROXY_BASE + url;
                        console.log('🔗 Proxying XHR request to:', url);
                      } else if (url.startsWith(TOOL_ORIGIN)) {
                        url = url.replace(TOOL_ORIGIN, PROXY_BASE);
                        console.log('🔗 Proxying absolute XHR request to:', url);
                      }
                    }
                    return originalOpen.call(this, method, url, ...args);
                  };
                  
                  // Include credentials
                  xhr.withCredentials = true;
                  
                  return xhr;
                };
                
                // Override document.createElement for dynamic script/link loading
                const originalCreateElement = document.createElement;
                document.createElement = function(tagName) {
                  const element = originalCreateElement.call(this, tagName);
                  
                  if (tagName.toLowerCase() === 'script') {
                    const originalSetAttribute = element.setAttribute;
                    element.setAttribute = function(name, value) {
                      if (name === 'src' && typeof value === 'string') {
                        if (value.startsWith('/') && !value.includes('/api/management/tools/')) {
                          value = PROXY_BASE + value;
                          console.log('🔗 Proxying script src to:', value);
                        } else if (value.startsWith(TOOL_ORIGIN)) {
                          value = value.replace(TOOL_ORIGIN, PROXY_BASE);
                          console.log('🔗 Proxying absolute script src to:', value);
                        }
                      }
                      return originalSetAttribute.call(this, name, value);
                    };
                    
                    // Also handle direct src assignment
                    Object.defineProperty(element, 'src', {
                      set: function(value) {
                        if (typeof value === 'string') {
                          if (value.startsWith('/') && !value.includes('/api/management/tools/')) {
                            value = PROXY_BASE + value;
                            console.log('🔗 Proxying script src assignment to:', value);
                          } else if (value.startsWith(TOOL_ORIGIN)) {
                            value = value.replace(TOOL_ORIGIN, PROXY_BASE);
                            console.log('🔗 Proxying absolute script src assignment to:', value);
                          }
                        }
                        this.setAttribute('src', value);
                      },
                      get: function() {
                        return this.getAttribute('src');
                      }
                    });
                  } else if (tagName.toLowerCase() === 'link') {
                    // Handle CSS links
                    const originalSetAttribute = element.setAttribute;
                    element.setAttribute = function(name, value) {
                      if (name === 'href' && typeof value === 'string') {
                        if (value.startsWith('/') && !value.includes('/api/management/tools/')) {
                          value = PROXY_BASE + value;
                          console.log('🔗 Proxying link href to:', value);
                        } else if (value.startsWith(TOOL_ORIGIN)) {
                          value = value.replace(TOOL_ORIGIN, PROXY_BASE);
                          console.log('🔗 Proxying absolute link href to:', value);
                        }
                      }
                      return originalSetAttribute.call(this, name, value);
                    };
                  }
                  
                  return element;
                };
                
                // Override webpack's __webpack_public_path__ if it exists
                if (typeof __webpack_public_path__ !== 'undefined') {
                  console.log('🔧 Original webpack public path:', __webpack_public_path__);
                  __webpack_public_path__ = PROXY_BASE + '/';
                  console.log('🔗 Set webpack public path to:', __webpack_public_path__);
                }
                
                // Override webpack's require.p if it exists (for chunk loading)
                if (typeof __webpack_require__ !== 'undefined' && __webpack_require__.p !== undefined) {
                  console.log('🔧 Original webpack require.p:', __webpack_require__.p);
                  __webpack_require__.p = PROXY_BASE + '/';
                  console.log('🔗 Set webpack require.p to:', __webpack_require__.p);
                }
                
                // Try to override the public path at window level too
                if (window.__webpack_public_path__) {
                  window.__webpack_public_path__ = PROXY_BASE + '/';
                }
                
                // Additional webpack runtime override
                setTimeout(() => {
                  // Try to find and override webpack runtime after it loads
                  if (window.webpackJsonp || window.__webpack_require__) {
                    console.log('🔧 Applying late webpack overrides...');
                    
                    if (window.__webpack_require__ && window.__webpack_require__.p !== undefined) {
                      console.log('🔧 Late override webpack require.p:', window.__webpack_require__.p);
                      window.__webpack_require__.p = PROXY_BASE + '/';
                    }
                    
                    // Override chunk loading if it exists
                    if (window.__webpack_require__ && window.__webpack_require__.e) {
                      const originalChunkLoad = window.__webpack_require__.e;
                      window.__webpack_require__.e = function(chunkId) {
                        console.log('🔗 Loading webpack chunk:', chunkId);
                        
                        // Call the global override before loading
                        if (window.__setWebpackPublicPath) {
                          window.__setWebpackPublicPath();
                        }
                        
                        return originalChunkLoad.call(this, chunkId);
                      };
                    }
                    
                    // Override jsonp chunk loading if available
                    if (window.__webpack_require__ && window.__webpack_require__.f && window.__webpack_require__.f.j) {
                      const originalJsonpLoad = window.__webpack_require__.f.j;
                      window.__webpack_require__.f.j = function(chunkId, promises) {
                        console.log('🔗 JSONP loading chunk:', chunkId);
                        
                        // Force public path override
                        if (window.__setWebpackPublicPath) {
                          window.__setWebpackPublicPath();
                        }
                        
                        return originalJsonpLoad.call(this, chunkId, promises);
                      };
                    }
                  }
                }, 100);
                
                // Continue checking for webpack and overriding
                const webpackChecker = setInterval(() => {
                  if (window.__webpack_require__) {
                    if (window.__setWebpackPublicPath) {
                      window.__setWebpackPublicPath();
                    }
                    
                    // After 10 seconds, we can stop checking so frequently
                    setTimeout(() => clearInterval(webpackChecker), 10000);
                  }
                }, 200);
                
                // Check if we're in an iframe
                const isInIframe = window !== window.top;
                
                if (isInIframe) {
                  console.log("🖼️ Running inside iframe - special handling enabled");
                  
                  // Add an option to break out of iframe if needed
                  setTimeout(() => {
                    const breakoutDiv = document.createElement('div');
                    breakoutDiv.style.cssText = \`
                      position: fixed;
                      top: 10px;
                      right: 10px;
                      background: rgba(244, 67, 54, 0.9);
                      color: white;
                      padding: 8px 12px;
                      border-radius: 4px;
                      z-index: 9999;
                      font-size: 12px;
                      cursor: pointer;
                      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
                      border: 1px solid #f44336;
                      backdrop-filter: blur(5px);
                      font-family: monospace;
                    \`;
                    breakoutDiv.innerHTML = '🚪 Open in New Tab';
                    breakoutDiv.title = 'Open this tool in a new browser tab for full functionality';
                    breakoutDiv.onclick = () => {
                      window.top.postMessage({
                        type: 'OPEN_IN_NEW_TAB',
                        url: '${tool.url}'
                      }, '*');
                    };
                    document.body.appendChild(breakoutDiv);
                  }, 1000);
                }
              })();
            </script>
          </head>`)
          
          .replace(/<\/body>/gi, `
            <script>
              // Final cleanup and iframe communication
              console.log("✅ ${tool.name} iframe proxy setup complete");
              
              // Monitor and fix any dynamic URL changes
              const observer = new MutationObserver(function(mutations) {
                mutations.forEach(function(mutation) {
                  if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(function(node) {
                      if (node.nodeType === Node.ELEMENT_NODE) {
                        // Fix any newly added script tags
                        if (node.tagName === 'SCRIPT' && node.src && node.src.startsWith('/') && !node.src.includes('/api/management/tools/')) {
                          console.log('🔧 Fixing dynamically added script:', node.src);
                          node.src = '${baseProxyPath}' + node.src;
                        }
                        
                        // Fix any newly added link tags
                        if (node.tagName === 'LINK' && node.href && node.href.startsWith('/') && !node.href.includes('/api/management/tools/')) {
                          console.log('🔧 Fixing dynamically added link:', node.href);
                          node.href = '${baseProxyPath}' + node.href;
                        }
                        
                        // Recursively check child elements
                        const scripts = node.querySelectorAll && node.querySelectorAll('script[src^="/"]');
                        if (scripts) {
                          scripts.forEach(script => {
                            if (!script.src.includes('/api/management/tools/')) {
                              console.log('🔧 Fixing nested script:', script.src);
                              script.src = '${baseProxyPath}' + script.src;
                            }
                          });
                        }
                        
                        const links = node.querySelectorAll && node.querySelectorAll('link[href^="/"]');
                        if (links) {
                          links.forEach(link => {
                            if (!link.href.includes('/api/management/tools/')) {
                              console.log('🔧 Fixing nested link:', link.href);
                              link.href = '${baseProxyPath}' + link.href;
                            }
                          });
                        }
                      }
                    });
                  }
                });
              });
              
              // Start observing
              observer.observe(document.body, {
                childList: true,
                subtree: true
              });
              
              // Handle form submissions for iframe compatibility
              document.addEventListener('DOMContentLoaded', function() {
                // Fix existing forms
                const forms = document.querySelectorAll('form');
                forms.forEach(form => {
                  const originalAction = form.getAttribute('action') || form.action;
                  if (originalAction && originalAction.startsWith('/') && !originalAction.includes('/api/management/tools/')) {
                    form.setAttribute('action', '${baseProxyPath}' + originalAction);
                    console.log('🔗 Fixed form action to:', form.getAttribute('action'));
                  }
                });
                
                // Fix any existing relative-path scripts and links that might have been missed
                const scripts = document.querySelectorAll('script[src^="/"]');
                scripts.forEach(script => {
                  if (!script.src.includes('/api/management/tools/')) {
                    console.log('🔧 Fixing existing script:', script.src);
                    script.src = '${baseProxyPath}' + script.src.substring(script.src.indexOf('/', 1));
                  }
                });
                
                const links = document.querySelectorAll('link[href^="/"]');
                links.forEach(link => {
                  if (!link.href.includes('/api/management/tools/')) {
                    console.log('🔧 Fixing existing link:', link.href);
                    link.href = '${baseProxyPath}' + link.href.substring(link.href.indexOf('/', 1));
                  }
                });
              });
              
              // Override history API to handle SPA navigation
              if (window.history && window.history.pushState) {
                const originalPushState = window.history.pushState;
                const originalReplaceState = window.history.replaceState;
                
                window.history.pushState = function(state, title, url) {
                  if (typeof url === 'string' && url.startsWith('/') && !url.includes('/api/management/tools/')) {
                    url = '${baseProxyPath}' + url;
                    console.log('🔗 Proxying history.pushState to:', url);
                  }
                  return originalPushState.call(this, state, title, url);
                };
                
                window.history.replaceState = function(state, title, url) {
                  if (typeof url === 'string' && url.startsWith('/') && !url.includes('/api/management/tools/')) {
                    url = '${baseProxyPath}' + url;
                    console.log('🔗 Proxying history.replaceState to:', url);
                  }
                  return originalReplaceState.call(this, state, title, url);
                };
              }
            </script>
          </body>`);
        
        console.log('✅ HTML sent (' + htmlContent.length + ' chars)');
        res.send(htmlContent);
      });
      
      response.data.on('error', (error) => {
        console.error('❌ Stream error:', error);
        res.status(500).send('Proxy stream error');
      });
      
    } else {
      // For non-HTML content (CSS, JS, images, etc.), stream directly
      console.log(`📦 Streaming ${contentType} content...`);
      response.data.pipe(res);
    }
    
  } catch (error) {
    console.error('❌ Proxy error:', error.message);
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return res.status(502).json({ 
        error: 'Unable to connect to the target service',
        details: 'The service may be down or unreachable'
      });
    }
    
    if (error.response) {
      // Forward error response from target server
      return res.status(error.response.status).json({
        error: `Target server error: ${error.response.status}`,
        message: error.message
      });
    }
    
    res.status(500).json({ 
      error: 'Proxy server error',
      message: error.message 
    });
  }
});

module.exports = router;