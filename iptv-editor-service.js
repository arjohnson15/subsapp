// iptv-editor-service.js
// CORRECTED IPTV Editor API Service for JohnsonFlix Manager
// Handles all interactions with editor.iptveditor.com API

const axios = require('axios');
const db = require('./database-config');
const FormData = require('form-data');

class IPTVEditorService {
    constructor() {
        this.baseURL = 'https://editor.iptveditor.com'; 
        this.bearerToken = null;
        this.defaultPlaylistId = null;
        this.initialized = false;
    }
    
    // FIXED: Use consistent baseURL property name
    async initialize() {
        try {
            const settings = await this.getAllSettings();
            
            // Update service configuration
            if (settings.bearer_token) {
                this.bearerToken = settings.bearer_token;
            }
            // REMOVED: base_url setting since we have a fixed URL
            if (settings.default_playlist_id) {
                this.defaultPlaylistId = settings.default_playlist_id;
            }
            
            console.log('✅ IPTV Editor service initialized with database settings');
            this.initialized = true; // FIXED: Set this after successful initialization
            return true;
            
        } catch (error) {
            console.error('❌ Failed to initialize IPTV Editor service:', error);
            this.initialized = false;
            throw error;
        }
    }
    
    
    // Get setting from database
async getSetting(key) {
    try {
        const rows = await db.query(
            'SELECT setting_value, setting_type FROM iptv_editor_settings WHERE setting_key = ?',
            [key]
        );
        
        if (rows.length === 0) {
            return null;
        }
        
        const row = rows[0];
        let value = row.setting_value;
        
        // Convert value based on type
        switch (row.setting_type) {
            case 'boolean':
                value = value === 'true' || value === true;
                break;
            case 'integer':
                value = parseInt(value) || 0;
                break;
            case 'json':
                try {
                    value = JSON.parse(value);
                } catch (e) {
                    value = {};
                }
                break;
            default:
                // string - keep as is
                break;
        }
        
        return value;
    } catch (error) {
        console.error(`❌ Failed to get setting ${key}:`, error);
        throw error;
    }
}
    
    // Set setting in database
async setSetting(key, value, type = 'string') {
    try {
        let processedValue = value;
        
        // Convert value to string for storage
        if (type === 'json') {
            processedValue = JSON.stringify(value);
        } else if (type === 'boolean') {
            processedValue = value ? 'true' : 'false';
        } else {
            processedValue = String(value);
        }
        
        await db.query(`
            INSERT INTO iptv_editor_settings (setting_key, setting_value, setting_type) 
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE 
            setting_value = VALUES(setting_value),
            setting_type = VALUES(setting_type),
            updated_at = CURRENT_TIMESTAMP
        `, [key, processedValue, type]);
        
        console.log(`✅ Setting ${key} updated successfully`);
        return true;
        
    } catch (error) {
        console.error(`❌ Failed to set setting ${key}:`, error);
        throw error;
    }
}
    
    // Get all settings for frontend
async getAllSettings() {
    try {
        const rows = await db.query('SELECT setting_key, setting_value, setting_type FROM iptv_editor_settings');
        
        const settings = {};
        for (const row of rows) {
            let value = row.setting_value;
            
            // Convert value based on type
            switch (row.setting_type) {
                case 'boolean':
                    value = value === 'true' || value === true;
                    break;
                case 'integer':
                    value = parseInt(value) || 0;
                    break;
                case 'json':
                    try {
                        value = JSON.parse(value);
                    } catch (e) {
                        value = {};
                    }
                    break;
                default:
                    // string - keep as is
                    break;
            }
            
            settings[row.setting_key] = value;
        }
        
        return settings;
    } catch (error) {
        console.error('❌ Failed to get all settings:', error);
        throw error;
    }
}

// ADD this method to the IPTVEditorService class in iptv-editor-service.js
async makeAPICall(endpoint, data = {}, method = 'POST') {
    try {
        console.log(`🌐 Making IPTV Editor API call: ${method} ${endpoint}`);
        
        if (!this.bearerToken) {
            throw new Error('Bearer token not configured');
        }
        
        const url = `${this.baseURL}${endpoint}`;
        const options = {
            method: method,
            headers: {
                'Authorization': `Bearer ${this.bearerToken}`,
                'Content-Type': 'application/json',
                'Origin': 'https://cloud.iptveditor.com',
                'Referer': 'https://cloud.iptveditor.com/'
            }
        };
        
        // Add body for POST/PUT requests
        if (method !== 'GET' && Object.keys(data).length > 0) {
            options.body = JSON.stringify(data);
        }
        
        const response = await fetch(url, options);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API call failed: ${response.status} ${response.statusText}. ${errorText}`);
        }
        
        const result = await response.json();
        console.log(`✅ API call completed: ${endpoint}`);
        
        return result;
        
    } catch (error) {
        console.error(`❌ API call failed for ${endpoint}:`, error);
        throw error;
    }
}

// ADD this method to the IPTVEditorService class in iptv-editor-service.js
async getAutoUpdaterConfig(playlistId) {
    try {
        console.log('🔄 Phase 0: Getting auto-updater configuration...');
        
        const response = await fetch(`${this.baseURL}/api/auto-updater/get-data`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.bearerToken}`,
                'Content-Type': 'application/json',
                'Origin': 'https://cloud.iptveditor.com',
                'Referer': 'https://cloud.iptveditor.com/'
            },
            body: JSON.stringify({ playlist: playlistId })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Phase 0 failed: ${response.status} ${response.statusText}. ${errorText}`);
        }
        
        const configData = await response.json();
        console.log('✅ Phase 0 completed - playlist configuration retrieved');
        console.log('📊 Configuration size:', JSON.stringify(configData).length, 'bytes');
        
        return configData;
        
    } catch (error) {
        console.error('❌ Phase 0 failed:', error);
        throw error;
    }
}

// FIXED: getStoredPlaylists - Handle database patterns properly
async getStoredPlaylists() {
    try {
        const playlists = await db.query(`
            SELECT playlist_id, name, customer_count, channel_count, 
                   movie_count, series_count, expiry_date, is_active, last_synced,
                   patterns, username, password, m3u_code, epg_code, max_connections
            FROM iptv_editor_playlists 
            WHERE is_active = TRUE
            ORDER BY name
        `);
        
        // FIXED: Handle patterns field properly
        const processedPlaylists = playlists.map(playlist => {
            // Debug what we're getting from database
            console.log(`🔍 DEBUG: Raw patterns for ${playlist.name}:`, playlist.patterns);
            console.log(`🔍 DEBUG: Patterns type: ${typeof playlist.patterns}`);
            
            // Handle different cases for patterns field
            if (!playlist.patterns) {
                // NULL or undefined
                playlist.patterns = [];
            } else if (typeof playlist.patterns === 'string') {
                // String from database - try to parse
                if (playlist.patterns === '' || playlist.patterns === 'null') {
                    playlist.patterns = [];
                } else if (playlist.patterns === '[object Object]') {
                    console.warn(`⚠️ Found malformed patterns for ${playlist.name}, setting to empty array`);
                    playlist.patterns = [];
                } else {
                    try {
                        playlist.patterns = JSON.parse(playlist.patterns);
                    } catch (e) {
                        console.warn(`⚠️ Failed to parse patterns for playlist ${playlist.name}:`, e);
                        console.warn(`⚠️ Raw patterns value was:`, playlist.patterns);
                        playlist.patterns = [];
                    }
                }
            } else if (Array.isArray(playlist.patterns)) {
                // Already an array - keep as is
                console.log(`✅ Patterns for ${playlist.name} is already an array`);
            } else {
                // Some other type - convert to array
                console.warn(`⚠️ Unexpected patterns type for ${playlist.name}:`, typeof playlist.patterns);
                playlist.patterns = [];
            }
            
            // Final safety check - ensure it's always an array
            if (!Array.isArray(playlist.patterns)) {
                playlist.patterns = [];
            }
            
            return playlist;
        });
        
        return processedPlaylists;
    } catch (error) {
        console.error('❌ Failed to get stored playlists:', error);
        throw error;
    }
}

// FIXED: storePlaylist - Better error handling and validation
async storePlaylist(playlist) {
    try {
        console.log('🔍 DEBUG: Storing playlist:', playlist.name);
        
        // Validate playlist data
        if (!playlist.id) {
            throw new Error('Playlist ID is required');
        }
        
        if (!playlist.name) {
            throw new Error('Playlist name is required');
        }
        
        // FIXED: Ensure patterns is properly processed
        let patternsJson = '[]'; // Default empty array
        if (playlist.patterns && Array.isArray(playlist.patterns)) {
            try {
                patternsJson = JSON.stringify(playlist.patterns);
                console.log('🔍 DEBUG: Patterns JSON being stored:', patternsJson);
            } catch (e) {
                console.warn('⚠️ Failed to stringify patterns, using empty array:', e);
                patternsJson = '[]';
            }
        } else if (playlist.patterns) {
            console.warn('⚠️ Patterns is not an array:', typeof playlist.patterns, playlist.patterns);
            patternsJson = '[]';
        }
        
        console.log('🔍 DEBUG: Final patterns value to store:', patternsJson);
        
        await db.query(`
            INSERT INTO iptv_editor_playlists (
                playlist_id, name, username, password, m3u_code, epg_code, 
                expiry_date, max_connections, customer_count, channel_count, 
                movie_count, series_count, patterns, last_synced
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            username = VALUES(username),
            password = VALUES(password),
            m3u_code = VALUES(m3u_code),
            epg_code = VALUES(epg_code),
            expiry_date = VALUES(expiry_date),
            max_connections = VALUES(max_connections),
            customer_count = VALUES(customer_count),
            channel_count = VALUES(channel_count),
            movie_count = VALUES(movie_count),
            series_count = VALUES(series_count),
            patterns = VALUES(patterns),
            last_synced = NOW(),
            updated_at = CURRENT_TIMESTAMP
        `, [
            playlist.id,
            playlist.name,
            playlist.username || null,
            playlist.password || null,
            playlist.m3u || null,
            playlist.epg || null,
            playlist.expiry ? new Date(playlist.expiry) : null,
            playlist.max_connections || 1,
            playlist.customerCount || 0,
            playlist.channel || 0,
            playlist.movie || 0,
            playlist.series || 0,
            patternsJson  // FIXED: Use properly processed JSON string
        ]);
        
        console.log(`✅ Successfully stored playlist: ${playlist.name}`);
        return true;
    } catch (error) {
        console.error('❌ Failed to store playlist:', error);
        throw error;
    }
}

async clearStoredPlaylists() {
    try {
        await db.query('DELETE FROM iptv_editor_playlists');
        console.log('✅ Cleared all stored playlists');
        return true;
    } catch (error) {
        console.error('❌ Failed to clear stored playlists:', error);
        throw error;
    }
}
    
    // =============================================================================
    // HTTP REQUEST HELPERS
    // =============================================================================
    
getHeaders() {
    return {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'User-Agent': 'curl/7.58.0',
        'Accept': '*/*',
        'Origin': 'https://cloud.iptveditor.com',
        'Authorization': `Bearer ${this.bearerToken}`
    };
}
    
async makeRequest(endpoint, data = {}, method = 'POST') {
    // Ensure service is initialized
    if (!this.initialized) {
        const init = await this.initialize();
        if (!init) {
            throw new Error('IPTV Editor service not properly configured');
        }
    }
    
    const startTime = Date.now();
    const url = `${this.baseURL}${endpoint}`;
    
    try {
        console.log(`📡 Making ${method} request to ${endpoint}...`);
        
        console.log('🔍 Full URL:', url);
        console.log('🔍 Headers being sent:', this.getHeaders());
        console.log('🔍 Bearer token length:', this.bearerToken ? this.bearerToken.length : 'NULL');
        console.log('🔍 Bearer token starts with:', this.bearerToken ? this.bearerToken.substring(0, 20) : 'NULL');
        console.log('🔍 Request body:', JSON.stringify(data));
        
        const config = {
            method,
            url,
            headers: this.getHeaders(),
            timeout: 30000,
            validateStatus: (status) => status < 500 // Don't throw on 4xx errors
        };
        
        if (method === 'POST') {
            config.data = data;
        }
        
        const response = await axios(config);
        const duration = Date.now() - startTime;
        
        // Check if response indicates success
        if (response.status >= 400) {
            throw new Error(`HTTP ${response.status}: ${response.data?.message || 'Request failed'}`);
        }
        
        // Log successful request
        await this.logSync(
            this.getLogTypeFromEndpoint(endpoint),
            data.user_id || null,
            'success',
            data,
            response.data,
            null,
            duration
        );
        
        console.log(`✅ Request to ${endpoint} completed successfully (${duration}ms)`);
        return response.data;
        
    } catch (error) {
        const duration = Date.now() - startTime;
        
        // Enhanced error logging for debugging
        console.error('❌ IPTV Editor API Error Details:');
        console.error('   Endpoint:', endpoint);
        console.error('   Method:', method);
        console.error('   Duration:', duration + 'ms');
        
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Status Text:', error.response.statusText);
            console.error('   Response Headers:', JSON.stringify(error.response.headers, null, 2));
            console.error('   Response Data:', JSON.stringify(error.response.data, null, 2));
        } else if (error.request) {
            console.error('   No response received');
            console.error('   Request details:', error.request);
        } else {
            console.error('   Error setting up request:', error.message);
        }
        
        console.error('   Original request URL:', url);
        console.error('   Original request data:', JSON.stringify(data, null, 2));
        
        // Log failed request
        await this.logSync(
            this.getLogTypeFromEndpoint(endpoint),
            data.user_id || null,
            'error',
            data,
            error.response?.data || null,
            error.response?.data?.message || error.message,
            duration
        );
        
        throw new Error(`IPTV Editor API Error: HTTP ${error.response?.status || 'Unknown'}: ${error.response?.data?.message || error.message || 'Request failed'}`);
    }
}
    
    getLogTypeFromEndpoint(endpoint) {
        if (endpoint.includes('new-customer')) return 'user_create';
        if (endpoint.includes('remove')) return 'user_delete';
        if (endpoint.includes('force-sync')) return 'user_sync';
        if (endpoint.includes('playlist')) return 'playlist_sync';
        if (endpoint.includes('auto-updater')) return 'playlist_sync';
        return 'api_error';
    }
    
    // =============================================================================
    // LOGGING SYSTEM
    // =============================================================================
    
    async logSync(syncType, userId, status, requestData, responseData, errorMessage = null, durationMs = 0) {
        try {
            await db.query(
                `INSERT INTO iptv_sync_logs (sync_type, user_id, status, request_data, response_data, error_message, duration_ms)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    syncType, 
                    userId, 
                    status, 
                    JSON.stringify(requestData), 
                    JSON.stringify(responseData), 
                    errorMessage, 
                    durationMs
                ]
            );
        } catch (error) {
            console.error('❌ Failed to log sync:', error);
        }
    }
    
    // =============================================================================
    // CORE API METHODS
    // =============================================================================
    
    // 1. Create New User
    async createUser(userData) {
        try {
            console.log(`👤 Creating IPTV Editor user for ${userData.username}...`);
            
            const data = {
                playlist_id: this.defaultPlaylistId,
                username: userData.username,
                password: userData.password,
                max_connections: userData.max_connections || 1,
                expiry_date: userData.expiry_date,
                user_id: userData.user_id
            };
            
            const response = await this.makeRequest('/api/reseller/new-customer', data);
            
            // Store in database if successful
            if (response && response.success) {
                await this.createIPTVEditorUser(userData.user_id, {
                    iptv_editor_id: response.user_id,
                    iptv_editor_username: userData.username,
                    iptv_editor_password: userData.password,
                    m3u_code: response.m3u_code,
                    epg_code: response.epg_code,
                    expiry_date: userData.expiry_date,
                    max_connections: userData.max_connections || 1,
                    sync_status: 'synced'
                });
                
                console.log(`✅ User ${userData.username} created successfully`);
            }
            
            return response;
            
        } catch (error) {
            console.error(`❌ Failed to create user ${userData.username}:`, error);
            throw error;
        }
    }
    
// 2. Delete User
// CORRECT Implementation for IPTV Editor deleteUser method
// Replace the existing deleteUser method in iptv-editor-service.js

async deleteUser(userId) {
    try {
        console.log(`🗑️ Deleting IPTV Editor user ${userId}...`);
        
        // Get the local IPTV Editor user record
        const iptvUser = await this.getIPTVEditorUser(userId);
        if (!iptvUser) {
            console.log(`❌ User ${userId} not found in IPTV Editor - may have been already deleted`);
            return { success: true, message: 'User not found in IPTV Editor (already deleted)' };
        }
        
        // Get the default playlist ID from settings
        const playlistId = await this.getSetting('default_playlist_id');
        if (!playlistId) {
            throw new Error('Default playlist ID not configured in IPTV Editor settings');
        }
        
        // CORRECT API FORMAT: Use playlist + items array structure
        const deleteData = {
            playlist: playlistId,  // Required: The playlist ID (e.g., "17156255751653618773")
            items: [
                {
                    id: iptvUser.iptv_editor_id  // Required: The IPTV Editor user ID
                }
            ]
        };
        
        console.log(`🗑️ Deleting IPTV Editor user ID ${iptvUser.iptv_editor_id} from playlist ${playlistId}`);
        
        try {
            const response = await this.makeRequest('/api/reseller/remove', deleteData);
            console.log('✅ IPTV Editor API deletion response:', response);
        } catch (apiError) {
            console.warn('⚠️ IPTV Editor API deletion failed (user may not exist on remote):', apiError.message);
            // Continue with local deletion even if API fails
        }
        
        // Always clean up local database regardless of API result
        await db.query('DELETE FROM iptv_editor_users WHERE user_id = ?', [userId]);
        
        // Update user table
        await db.query('UPDATE users SET iptv_editor_enabled = FALSE WHERE id = ?', [userId]);
        
        console.log(`✅ User ${userId} deleted from local IPTV Editor database`);
        
        return { 
            success: true, 
            message: `IPTV Editor user ${userId} deleted successfully` 
        };
        
    } catch (error) {
        console.error(`❌ Failed to delete IPTV Editor user ${userId}:`, error);
        throw error;
    }
}

// Alternative method to delete by IPTV Editor ID directly (if needed)
async deleteUserByIPTVEditorId(iptvEditorId) {
    try {
        console.log(`🗑️ Deleting IPTV Editor user by ID: ${iptvEditorId}...`);
        
        const data = {
            user_id: iptvEditorId
        };
        
        const response = await this.makeRequest('/api/reseller/remove', data);
        
        if (response && response.success) {
            // Find and remove from local database
            await db.query('DELETE FROM iptv_editor_users WHERE iptv_editor_id = ?', [iptvEditorId]);
            
            console.log(`✅ IPTV Editor user ${iptvEditorId} deleted successfully`);
        }
        
        return response;
        
    } catch (error) {
        console.error(`❌ Failed to delete IPTV Editor user ${iptvEditorId}:`, error);
        throw error;
    }
}
    
    // 3. Get All Users
// FIXED VERSION:
async getAllUsers() {
    try {
        console.log('👥 Fetching all IPTV Editor users...');
        
        // Get the default playlist ID from settings
        const playlistId = await this.getSetting('default_playlist_id');
        if (!playlistId) {
            throw new Error('Default playlist ID not configured in IPTV Editor settings');
        }
        
        console.log('📺 Using playlist ID:', playlistId);
        
        // FIXED: Include playlist ID in request body
        const requestData = {
            playlist: playlistId
        };
        
        const response = await this.makeRequest('/api/reseller/get-data', requestData);
        
        // The response contains an 'items' array, not 'users'
        const users = response?.items || [];
        console.log(`✅ Fetched ${users.length} users from IPTV Editor`);
        
        return users;  // Return the users array directly
        
    } catch (error) {
        console.error('❌ Failed to get all users:', error);
        throw error;
    }
}
    
    // 4. Sync User
async syncUser(userData, userId) {
    await this.initialize();
    const startTime = Date.now();
    
    const requestData = {
        playlist: this.defaultPlaylistId,
        items: [{
            id: userData.iptvEditorId,
            username: userData.username,
            password: userData.password
        }],
        xtream: {
            url: "https://pinkpony.lol",
            param1: userData.username,
            param2: userData.password,
            type: "xtream"
        }
    };
    
    try {
        console.log('📤 Calling force-sync API with:', requestData);
        
        const response = await axios.post(`${this.baseURL}/api/reseller/force-sync`, requestData, {
            headers: this.getHeaders(),
            timeout: 30000
        });
        
        console.log('✅ Force-sync response:', response.data);
        
        const duration = Date.now() - startTime;
        await this.logSync('user_sync', userId, 'success', requestData, response.data, null, duration);
        
        return response.data;
    } catch (error) {
        console.error('❌ Force-sync failed:', error);
        const duration = Date.now() - startTime;
        await this.logSync('user_sync', userId, 'error', requestData, null, error.message, duration);
        throw error;
    }
}
    
    // 5. Get Playlists
async getPlaylists() {
    try {
        console.log('📺 Fetching IPTV Editor playlists...');
        
        const response = await this.makeRequest('/api/playlist/list', {});
        
        console.log(`✅ Fetched playlists from IPTV Editor`);
        return response;  // Return the response directly
        
    } catch (error) {
        console.error('❌ Failed to get playlists:', error);
        throw error;
    }
}
    
    // 6. Get Categories
    async getCategories() {
        try {
            console.log('📂 Fetching IPTV Editor categories...');
            
            const response = await this.makeRequest('/api/category/channel/get-data', {});
            
            console.log(`✅ Fetched ${response?.categories?.length || 0} categories`);
            return response?.categories || [];
            
        } catch (error) {
            console.error('❌ Failed to get categories:', error);
            throw error;
        }
    }
    
    // 7. Get Channels
    async getChannels() {
        try {
            console.log('📺 Fetching IPTV Editor channels...');
            
            const response = await this.makeRequest('/api/stream/channel/get-data', {});
            
            console.log(`✅ Fetched ${response?.channels?.length || 0} channels`);
            return response?.channels || [];
            
        } catch (error) {
            console.error('❌ Failed to get channels:', error);
            throw error;
        }
    }
    
    // 8. Update Playlists
async updatePlaylists() {
    try {
        console.log('🔄 Updating IPTV Editor playlists (incremental sync)...');
        
        // Get current playlists from API
        const response = await this.makeRequest('/api/playlist/list', {});
        
        if (!response || !response.playlist || !Array.isArray(response.playlist)) {
            throw new Error('Invalid playlist data received from IPTV Editor API');
        }
        
        const apiPlaylists = response.playlist;
        console.log(`📥 Retrieved ${apiPlaylists.length} playlists from IPTV Editor`);
        
        // Get existing playlists from database
        const existingPlaylists = await db.query(`
            SELECT playlist_id, name, customer_count, channel_count, 
                   movie_count, series_count, expiry_date, max_connections,
                   username, password, m3u_code, epg_code, patterns
            FROM iptv_editor_playlists
        `);
        
        // Create maps for efficient comparison
        const existingMap = new Map();
        existingPlaylists.forEach(playlist => {
            existingMap.set(playlist.playlist_id, playlist);
        });
        
        const apiMap = new Map();
        apiPlaylists.forEach(playlist => {
            apiMap.set(playlist.id, playlist);
        });
        
        let insertCount = 0;
        let updateCount = 0;
        let deleteCount = 0;
        
        // Process API playlists (Insert new + Update changed)
        for (const apiPlaylist of apiPlaylists) {
            const existing = existingMap.get(apiPlaylist.id);
            
            if (!existing) {
                // INSERT: New playlist
                await db.query(`
                    INSERT INTO iptv_editor_playlists (
                        playlist_id, name, username, password, m3u_code, epg_code, 
                        expiry_date, max_connections, customer_count, channel_count, 
                        movie_count, series_count, patterns, last_synced, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())
                `, [
                    apiPlaylist.id,
                    apiPlaylist.name,
                    apiPlaylist.username || null,
                    apiPlaylist.password || null,
                    apiPlaylist.m3u || null,
                    apiPlaylist.epg || null,
                    apiPlaylist.expiry ? new Date(apiPlaylist.expiry) : null,
                    apiPlaylist.max_connections || 1,
                    apiPlaylist.customerCount || 0,
                    apiPlaylist.channel || 0,
                    apiPlaylist.movie || 0,
                    apiPlaylist.series || 0,
                    JSON.stringify(apiPlaylist.patterns || [])
                ]);
                
                insertCount++;
                console.log(`➕ Added new playlist: ${apiPlaylist.name}`);
                
            } else {
                // CHECK: Has anything changed?
                const hasChanges = (
                    existing.name !== apiPlaylist.name ||
                    existing.customer_count !== (apiPlaylist.customerCount || 0) ||
                    existing.channel_count !== (apiPlaylist.channel || 0) ||
                    existing.movie_count !== (apiPlaylist.movie || 0) ||
                    existing.series_count !== (apiPlaylist.series || 0) ||
                    existing.max_connections !== (apiPlaylist.max_connections || 1) ||
                    existing.username !== (apiPlaylist.username || null) ||
                    existing.password !== (apiPlaylist.password || null) ||
                    existing.m3u_code !== (apiPlaylist.m3u || null) ||
                    existing.epg_code !== (apiPlaylist.epg || null) ||
                    this.formatDate(existing.expiry_date) !== this.formatDate(apiPlaylist.expiry) ||
                    JSON.stringify(existing.patterns || []) !== JSON.stringify(apiPlaylist.patterns || [])
                );
                
                if (hasChanges) {
                    // UPDATE: Changed playlist
                    await db.query(`
                        UPDATE iptv_editor_playlists SET
                            name = ?, username = ?, password = ?, m3u_code = ?, epg_code = ?,
                            expiry_date = ?, max_connections = ?, customer_count = ?,
                            channel_count = ?, movie_count = ?, series_count = ?,
                            patterns = ?, last_synced = NOW(), updated_at = NOW()
                        WHERE playlist_id = ?
                    `, [
                        apiPlaylist.name,
                        apiPlaylist.username || null,
                        apiPlaylist.password || null,
                        apiPlaylist.m3u || null,
                        apiPlaylist.epg || null,
                        apiPlaylist.expiry ? new Date(apiPlaylist.expiry) : null,
                        apiPlaylist.max_connections || 1,
                        apiPlaylist.customerCount || 0,
                        apiPlaylist.channel || 0,
                        apiPlaylist.movie || 0,
                        apiPlaylist.series || 0,
                        JSON.stringify(apiPlaylist.patterns || []),
                        apiPlaylist.id
                    ]);
                    
                    updateCount++;
                    console.log(`🔄 Updated playlist: ${apiPlaylist.name}`);
                }
            }
        }
        
        // Remove playlists that no longer exist in API
        for (const [playlistId] of existingMap) {
            if (!apiMap.has(playlistId)) {
                await db.query(`
                    UPDATE iptv_editor_playlists 
                    SET is_active = FALSE, updated_at = NOW() 
                    WHERE playlist_id = ?
                `, [playlistId]);
                
                deleteCount++;
                console.log(`❌ Deactivated removed playlist: ${playlistId}`);
            }
        }
        
        // Update last sync time
        await this.setSetting('last_sync_time', new Date().toISOString(), 'string');
        
        console.log(`✅ Playlist sync completed: +${insertCount} new, ~${updateCount} updated, -${deleteCount} deactivated`);
        
        return {
            success: true,
            message: `Sync completed: ${insertCount} new, ${updateCount} updated, ${deleteCount} deactivated`,
            counts: {
                inserted: insertCount,
                updated: updateCount,
                deactivated: deleteCount,
                total: apiPlaylists.length
            }
        };
        
    } catch (error) {
        console.error('❌ Failed to update playlists:', error);
        throw error;
    }
}

// Helper function for date comparison
formatDate(date) {
    if (!date) return null;
    return new Date(date).toISOString().split('T')[0]; // YYYY-MM-DD format
}
    
    // =============================================================================
    // DATABASE HELPER METHODS
    // =============================================================================
    
    async createIPTVEditorUser(userId, data) {
        try {
            await db.query(
                `INSERT INTO iptv_editor_users 
                (user_id, iptv_editor_id, iptv_editor_username, iptv_editor_password, 
                 m3u_code, epg_code, expiry_date, max_connections, sync_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId,
                    data.iptv_editor_id,
                    data.iptv_editor_username,
                    data.iptv_editor_password,
                    data.m3u_code,
                    data.epg_code,
                    data.expiry_date,
                    data.max_connections,
                    data.sync_status
                ]
            );
            
            console.log(`✅ IPTV Editor user record created for user ${userId}`);
            return true;
            
        } catch (error) {
            console.error(`❌ Error creating IPTV Editor user record for ${userId}:`, error);
            return false;
        }
    }
    
    async getIPTVEditorUser(userId) {
        try {
            const result = await db.query(
                'SELECT * FROM iptv_editor_users WHERE user_id = ?',
                [userId]
            );
            
            return result.length > 0 ? result[0] : null;
            
        } catch (error) {
            console.error(`❌ Error getting IPTV Editor user ${userId}:`, error);
            return null;
        }
    }
    
    async updateIPTVEditorUser(userId, data) {
        try {
            const updates = [];
            const values = [];
            
            Object.keys(data).forEach(key => {
                if (data[key] !== undefined) {
                    updates.push(`${key} = ?`);
                    values.push(data[key]);
                }
            });
            
            if (updates.length === 0) return false;
            
            values.push(userId);
            
            await db.query(
                `UPDATE iptv_editor_users SET ${updates.join(', ')}, updated_at = NOW() WHERE user_id = ?`,
                values
            );
            
            console.log(`✅ IPTV Editor user ${userId} updated successfully`);
            return true;
            
        } catch (error) {
            console.error(`❌ Error updating IPTV Editor user ${userId}:`, error);
            return false;
        }
    }
    
    // =============================================================================
    // UTILITY METHODS
    // =============================================================================
    
    generateIPTVUsername(name) {
        const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const random = Math.floor(Math.random() * 1000);
        return `${cleanName}${random}`;
    }
    
    generateIPTVPassword() {
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let password = '';
        for (let i = 0; i < 8; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
    }
    
    // =============================================================================
    // STATUS AND HEALTH CHECK
    // =============================================================================
    
    async isServiceEnabled() {
        try {
            const enabled = await this.getSetting('sync_enabled');
            return enabled === true;
        } catch (error) {
            console.error('❌ Error checking if service is enabled:', error);
            return false;
        }
    }
    

async testConnection() {
    try {
        console.log('🔧 Testing IPTV Editor connection...');
        
        // Test by fetching playlists (lightweight operation)
        const response = await this.getPlaylists();
        
        // Check if response has the expected structure
        if (response && response.playlist && Array.isArray(response.playlist)) {
            console.log(`✅ Connection test successful - found ${response.playlist.length} playlists`);
            return { 
                success: true, 
                message: 'Connection successful',
                playlistCount: response.playlist.length
            };
        } else {
            throw new Error('Invalid response format - expected playlist array');
        }
        
    } catch (error) {
        console.error('❌ Connection test failed:', error);
        return { 
            success: false, 
            message: error.message || 'Connection failed'
        };
    }
}
    
    // =============================================================================
    // BATCH OPERATIONS
    // =============================================================================
    
    async batchSyncUsers(userIds) {
        try {
            console.log(`🔄 Starting batch sync for ${userIds.length} users...`);
            
            const results = [];
            
            for (const userId of userIds) {
                try {
                    await this.syncUser(userId);
                    results.push({ userId, status: 'success' });
                } catch (error) {
                    results.push({ userId, status: 'error', error: error.message });
                }
            }
            
            const successCount = results.filter(r => r.status === 'success').length;
            const errorCount = results.filter(r => r.status === 'error').length;
            
            console.log(`✅ Batch sync completed: ${successCount} success, ${errorCount} errors`);
            
            return {
                success: true,
                results,
                summary: {
                    total: userIds.length,
                    success: successCount,
                    errors: errorCount
                }
            };
            
        } catch (error) {
            console.error('❌ Batch sync failed:', error);
            throw error;
        }
    }
    
    // =============================================================================
    // MAINTENANCE METHODS
    // =============================================================================
    
    async cleanupOldLogs(daysOld = 30) {
        try {
            console.log(`🧹 Cleaning up logs older than ${daysOld} days...`);
            
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysOld);
            
            const result = await db.query(
                'DELETE FROM iptv_sync_logs WHERE created_at < ?',
                [cutoffDate]
            );
            
            console.log(`✅ Cleaned up ${result.affectedRows} old log entries`);
            return result.affectedRows;
            
        } catch (error) {
            console.error('❌ Error cleaning up logs:', error);
            throw error;
        }
    }
    
    async getServiceStats() {
        try {
            const stats = {};
            
            // Get total users
            const totalUsers = await db.query('SELECT COUNT(*) as count FROM iptv_editor_users');
            stats.totalUsers = totalUsers[0].count;
            
            // Get users by status
            const statusCounts = await db.query(`
                SELECT sync_status, COUNT(*) as count 
                FROM iptv_editor_users 
                GROUP BY sync_status
            `);
            
            stats.usersByStatus = {};
            statusCounts.forEach(row => {
                stats.usersByStatus[row.sync_status] = row.count;
            });
            
            // Get recent sync activity
            const recentActivity = await db.query(`
                SELECT sync_type, status, COUNT(*) as count
                FROM iptv_sync_logs 
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
                GROUP BY sync_type, status
            `);
            
            stats.recentActivity = recentActivity;
            
            // Get last sync time
            stats.lastSyncTime = await this.getSetting('last_sync_time');
            
            return stats;
            
        } catch (error) {
            console.error('❌ Error getting service stats:', error);
            throw error;
        }
    }
	
	// =============================================================================
    // AUTO-UPDATER METHODS - ADD THESE BEFORE module.exports
    // =============================================================================
    
// Method to run the complete auto-updater process
async runAutoUpdater() {
    const startTime = Date.now();
    
    try {
        console.log('🚀 Starting auto-updater process...');
        
        // CRITICAL: Update timestamp immediately when process starts
        const processStartTime = new Date();
        await this.setSetting('last_auto_updater_run', processStartTime.toISOString(), 'string');
        console.log('📅 Service method - Updated timestamp at start:', processStartTime.toISOString());
        
        // Get settings
        const settings = await this.getAllSettings();
        const baseUrl = settings.provider_base_url;
        const username = settings.provider_username;
        const password = settings.provider_password;
        
        // Validate required settings
        if (!baseUrl || !username || !password) {
            throw new Error('Missing required provider settings. Please configure provider URL, username, and password.');
        }
        
        if (!settings.bearer_token || !settings.default_playlist_id) {
            throw new Error('Missing required IPTV Editor settings. Please configure bearer token and default playlist.');
        }
        
        console.log('🔧 Using provider settings:', {
            baseUrl: baseUrl ? baseUrl.substring(0, 20) + '...' : 'MISSING',
            username: username ? username.substring(0, 5) + '...' : 'MISSING',
            password: password ? '***' : 'MISSING'
        });
		
        // Phase 0: Get playlist configuration from IPTV Editor
        console.log('📋 Phase 0: Getting playlist configuration from IPTV Editor...');
        await this.getPlaylistConfiguration(settings.default_playlist_id);		
        
        // Phase 1: Collect all provider data (8 API calls)
        console.log('📥 Phase 1: Collecting provider data...');
        const datasets = await this.collectProviderData(baseUrl, username, password);
        
        // Phase 2: Submit to IPTV Editor auto-updater
        console.log('📤 Phase 2: Submitting to IPTV Editor...');
        const response = await this.submitToAutoUpdater(baseUrl, datasets);
        
        // Phase 3: Log success and calculate duration
        const duration = Date.now() - startTime;
        
        // Log the sync operation
        await this.logSync('playlist_sync', null, 'success', 
            { playlist: settings.default_playlist_id }, response.data, null, duration);
        
        // CRITICAL: Update timestamp after successful completion with current time
        const processEndTime = new Date();
        await this.setSetting('last_auto_updater_run', processEndTime.toISOString(), 'string');
        console.log('🏁 Service method - Final timestamp after completion:', processEndTime.toISOString());
        
        console.log(`✅ Auto-updater completed in ${Math.round(duration/1000)}s`);
        
        return {
            ...response.data,
            duration: `${Math.round(duration/1000)} seconds`,
            last_run: processEndTime.toISOString(),
            success: true
        };
        
    } catch (error) {
        console.error('❌ Auto-updater process failed:', error);
        
        const duration = Date.now() - startTime;
        
        // Log the failed sync operation
        try {
            const settings = await this.getAllSettings();
            await this.logSync('playlist_sync', null, 'error', 
                { playlist: settings.default_playlist_id }, null, error.message, duration);
        } catch (logError) {
            console.error('❌ Failed to log sync error:', logError);
        }
        
        // CRITICAL: Update timestamp even on failure so user knows when last attempt was
        const processFailTime = new Date();
        try {
            await this.setSetting('last_auto_updater_run', processFailTime.toISOString(), 'string');
            console.log('💀 Service method - Updated timestamp after failure:', processFailTime.toISOString());
        } catch (timestampError) {
            console.error('❌ Failed to update timestamp after service failure:', timestampError);
        }
        
        // Re-throw the error so the route handler can catch it
        throw error;
    }
}

// ADD this method to handle Phase 0
async getPlaylistConfiguration(playlistId) {
    console.log('📋 Getting playlist configuration for:', playlistId);
    
    try {
        const response = await fetch('https://editor.iptveditor.com/api/auto-updater/get-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.bearerToken}`,
                'Origin': 'https://cloud.iptveditor.com'
            },
            body: JSON.stringify({
                playlist: playlistId
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Phase 0 failed: ${response.status} ${response.statusText}. ${errorText}`);
        }
        
        const configData = await response.json();
        console.log('✅ Phase 0 completed - playlist configuration retrieved');
        console.log('📊 Configuration size:', JSON.stringify(configData).length, 'bytes');
        
        return configData;
        
    } catch (error) {
        console.error('❌ Phase 0 failed:', error);
        throw error;
    }
}

// REPLACE the existing collectProviderData method in iptv-editor-service.js with this complete version:

async collectProviderData(baseUrl, username, password) {
    console.log('🔄 Making 8 sequential API calls to provider...');
    console.log('🌐 Provider URL:', baseUrl);
    console.log('👤 Provider Username:', username);
    console.log('🔑 Provider Password:', password ? '***' : 'not set');
    
    const endpoints = [
        '',                                     // 1. Basic info
        '&action=get_live_streams',             // 2. Live streams
        '&action=get_live_categories',          // 3. Live categories
        '&action=get_vod_streams',              // 4. VOD streams
        '&action=get_vod_categories',           // 5. VOD categories
        '&action=get_series',                   // 6. Series
        '&action=get_series_categories'         // 7. Series categories
    ];
    
    const datasets = [];
    
    // First 7 calls to player_api.php (all return JSON)
    for (let i = 0; i < endpoints.length; i++) {
        const url = `${baseUrl}/player_api.php?username=${username}&password=${password}${endpoints[i]}`;
        const callName = endpoints[i] ? endpoints[i].replace('&action=', '') : 'basic_info';
        
        console.log(`📡 API Call ${i + 1}/8: ${callName}`);
        
        try {
            const response = await axios.get(url, { 
                timeout: 30000,
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            });
            
            // Convert response to JSON string for form submission
            const dataString = JSON.stringify(response.data);
            datasets.push(dataString);
            
            console.log(`✅ Call ${i + 1} completed - ${dataString.length} bytes`);
            
            // Log a preview of the data for debugging
            if (typeof response.data === 'object') {
                if (Array.isArray(response.data)) {
                    console.log(`   📋 Response: Array with ${response.data.length} items`);
                } else {
                    console.log(`   📋 Response: Object with keys: ${Object.keys(response.data).slice(0, 5).join(', ')}`);
                }
            }
            
        } catch (error) {
            console.error(`❌ API Call ${i + 1} failed:`, error.message);
            throw new Error(`Provider API call ${i + 1} (${callName}) failed: ${error.message}`);
        }
        
        // Small delay between requests to be respectful to the provider
        if (i < endpoints.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }
    
    // 8th call to get.php for M3U playlist (returns plain text)
    console.log('📡 API Call 8/8: M3U Playlist');
    try {
        const m3uUrl = `${baseUrl}/get.php?username=${username}&password=${password}&type=m3u_plus&output=ts`;
        console.log('🔗 M3U URL:', m3uUrl);
        
        const response = await axios.get(m3uUrl, { 
            timeout: 30000,
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });
        
        // M3U response is plain text, not JSON
        datasets.push(response.data);
        console.log(`✅ Call 8 completed - ${response.data.length} bytes`);
        console.log(`   📋 M3U Preview: ${response.data.substring(0, 100)}...`);
        
    } catch (error) {
        console.error('❌ API Call 8 (M3U) failed:', error.message);
        throw new Error(`M3U playlist retrieval failed: ${error.message}`);
    }
    
    console.log('✅ All provider data collected successfully');
    console.log('📊 Dataset summary:');
    datasets.forEach((dataset, index) => {
        const type = index < 7 ? 'JSON' : 'M3U';
        console.log(`   ${index + 1}. ${type} - ${dataset.length} bytes`);
    });
    
    return datasets;
}

// REPLACE submitToAutoUpdater method - Bearer token with exact HAR structure

async submitToAutoUpdater(baseUrl, datasets) {
    console.log('🚀 Starting auto-updater submission with corrected FormData...');
    
    // Validate bearer token
    if (!this.bearerToken) {
        throw new Error('Bearer token not configured');
    }
    
    console.log('🔑 Bearer token available, length:', this.bearerToken.length);
    
    const FormData = require('form-data');
    const formData = new FormData();
    
    console.log('📦 Creating FormData with all datasets...');
    
    // Add all fields in the correct order (matching working HAR)
    formData.append('url', baseUrl);
    
    // CRITICAL: Add each dataset as binary blob data
    formData.append('info', datasets[0], {
        filename: 'blob',
        contentType: 'application/octet-stream'
    });
    
    formData.append('get_live_streams', datasets[1], {
        filename: 'blob',
        contentType: 'application/octet-stream'
    });
    
    formData.append('get_live_categories', datasets[2], {
        filename: 'blob',
        contentType: 'application/octet-stream'
    });
    
    formData.append('get_vod_streams', datasets[3], {
        filename: 'blob',
        contentType: 'application/octet-stream'
    });
    
    formData.append('get_vod_categories', datasets[4], {
        filename: 'blob',
        contentType: 'application/octet-stream'
    });
    
    formData.append('get_series', datasets[5], {
        filename: 'blob',
        contentType: 'application/octet-stream'
    });
    
    formData.append('get_series_categories', datasets[6], {
        filename: 'blob',
        contentType: 'application/octet-stream'
    });
    
    formData.append('m3u', datasets[7], {
        filename: 'blob',
        contentType: 'application/octet-stream'
    });
    
    const totalSize = datasets.reduce((sum, dataset) => sum + (dataset?.length || 0), 0);
    const sizeMB = Math.round(totalSize / 1024 / 1024);
    
    console.log('📊 FormData prepared:');
    console.log(`   - Total size: ${sizeMB}MB`);
    console.log(`   - Number of fields: 9 (url + 8 datasets)`);
    console.log(`   - Base URL: ${baseUrl}`);
    
    try {
        console.log('📤 Submitting FormData to auto-updater...');
        
        // CRITICAL FIX: Let FormData generate the Content-Type header with boundary
        // Don't manually set content-type!
        const headers = {
            // Include FormData's own headers (content-type with boundary)
            ...formData.getHeaders(),
            
            // Add authentication and origin
            'authorization': `Bearer ${this.bearerToken}`,
            'origin': 'https://cloud.iptveditor.com',
            
            // Add other browser-like headers that don't conflict
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'en-GB,en;q=0.9,en-US;q=0.8',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-site',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0'
        };
        
        console.log('🔍 Headers prepared:');
        console.log('   ✅ FormData headers (with boundary) included');
        console.log('   ✅ Authorization header added');
        console.log('   ✅ Origin set to cloud.iptveditor.com');
        console.log('   🔍 Content-Type:', headers['content-type']?.substring(0, 50) + '...');
        
        const response = await axios.post(
            'https://editor.iptveditor.com/api/auto-updater/run-auto-updater', 
            formData, 
            {
                headers: headers,
                timeout: 600000, // 10 minutes
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                validateStatus: (status) => status < 500 // Don't throw on 4xx, we'll handle them
            }
        );
        
        console.log('✅ Request completed!');
        console.log('📊 Status:', response.status);
        console.log('📊 Status Text:', response.statusText);
        console.log('📊 Response size:', response.data ? JSON.stringify(response.data).length : 0, 'bytes');
        
        if (response.status === 200) {
            console.log('🎉 SUCCESS! Auto-updater accepted the submission');
            console.log('📊 Response data:', JSON.stringify(response.data, null, 2));
            
            // Check for job_id or success indicators
            if (response.data && typeof response.data === 'object') {
                if (response.data.job_id) {
                    console.log('🎉 Auto-updater job started with ID:', response.data.job_id);
                } else {
                    console.log('🎉 Auto-updater response received:', response.data);
                }
            }
            
            return { 
                success: true,
                data: response.data,
                status: response.status,
                message: 'Auto-updater submission successful'
            };
        } else {
            // Handle non-200 responses
            const errorMsg = response.data?.message || response.data?.title || response.statusText;
            throw new Error(`Auto-updater returned ${response.status}: ${errorMsg}`);
        }
        
    } catch (error) {
        console.error('❌ Auto-updater submission failed');
        console.error('🔍 Error type:', error.name);
        console.error('🔍 Error message:', error.message);
        
        if (error.response) {
            const status = error.response.status;
            const data = error.response.data;
            
            console.error('📄 HTTP Status:', status);
            console.error('📄 Response Headers:', Object.keys(error.response.headers));
            console.error('📄 Response Data:', JSON.stringify(data, null, 2));
            
            // Specific error handling based on status codes
            if (status === 401) {
                const errorDetail = data?.title || data?.message || 'Authentication failed';
                if (errorDetail.toLowerCase().includes('session') || errorDetail.toLowerCase().includes('expired')) {
                    throw new Error('IPTV Editor session expired. Your Bearer token needs to be refreshed. Please login to https://cloud.iptveditor.com and get a new token.');
                } else {
                    throw new Error(`IPTV Editor authentication failed: ${errorDetail}. Please check your Bearer token.`);
                }
            } else if (status === 400) {
                if (data?.title === 'Request not valid') {
                    // This might be our FormData structure issue
                    throw new Error(`IPTV Editor rejected the request format. Possible issues: invalid FormData structure, wrong field names, or data format. Payload size: ${sizeMB}MB`);
                } else {
                    throw new Error(`Bad request (400): ${data?.message || data?.title || 'Invalid request format'}`);
                }
            } else if (status === 413) {
                throw new Error(`Payload too large (${sizeMB}MB). Try reducing the data size or check IPTV Editor's size limits.`);
            } else if (status === 403) {
                throw new Error('Access forbidden. Your account may not have auto-updater permissions.');
            } else if (status === 429) {
                throw new Error('Rate limit exceeded. Please wait before trying again.');
            } else if (status >= 500) {
                throw new Error(`IPTV Editor server error (${status}). Please try again later.`);
            } else {
                throw new Error(`HTTP ${status}: ${data?.message || data?.title || error.response.statusText}`);
            }
        } else if (error.request) {
            console.error('📄 No response received');
            console.error('📄 Request timeout or network error');
            throw new Error('No response from IPTV Editor. Check your internet connection or try again later.');
        } else {
            console.error('📄 Error setting up request:', error.message);
            throw new Error(`Request setup error: ${error.message}`);
        }
    }
}

async debugFormData(baseUrl, datasets) {
    console.log('🔍 DEBUG: Inspecting FormData structure...');
    
    const FormData = require('form-data');
    const formData = new FormData();
    
    // Add all fields exactly as we do in submitToAutoUpdater
    formData.append('url', baseUrl);
    
    formData.append('info', datasets[0], {
        filename: 'blob',
        contentType: 'application/octet-stream'
    });
    
    formData.append('get_live_streams', datasets[1], {
        filename: 'blob',
        contentType: 'application/octet-stream'
    });
    
    formData.append('get_live_categories', datasets[2], {
        filename: 'blob',
        contentType: 'application/octet-stream'
    });
    
    formData.append('get_vod_streams', datasets[3], {
        filename: 'blob',
        contentType: 'application/octet-stream'
    });
    
    formData.append('get_vod_categories', datasets[4], {
        filename: 'blob',
        contentType: 'application/octet-stream'
    });
    
    formData.append('get_series', datasets[5], {
        filename: 'blob',
        contentType: 'application/octet-stream'
    });
    
    formData.append('get_series_categories', datasets[6], {
        filename: 'blob',
        contentType: 'application/octet-stream'
    });
    
    formData.append('m3u', datasets[7], {
        filename: 'blob',
        contentType: 'application/octet-stream'
    });
    
    // Get the FormData headers
    const headers = formData.getHeaders();
    console.log('🔍 FormData headers:', headers);
    
    // Get the boundary
    const boundary = formData.getBoundary();
    console.log('🔍 FormData boundary:', boundary);
    
    // Try to get the raw FormData content (first 1000 characters)
    return new Promise((resolve) => {
        let chunks = [];
        formData.on('data', (chunk) => {
            chunks.push(chunk);
        });
        
        formData.on('end', () => {
            const fullBuffer = Buffer.concat(chunks);
            const preview = fullBuffer.toString('utf8', 0, Math.min(1000, fullBuffer.length));
            
            console.log('🔍 FormData preview (first 1000 chars):');
            console.log(preview);
            console.log('🔍 FormData total size:', fullBuffer.length);
            
            resolve({
                headers,
                boundary,
                preview,
                totalSize: fullBuffer.length
            });
        });
    });
}

// ADD this method to your existing iptv-editor-service.js file
async collectProviderData(baseUrl, username, password) {
    console.log('🔄 Making 8 sequential API calls to provider...');
    console.log('🌐 Provider URL:', baseUrl);
    console.log('👤 Provider Username:', username);
    console.log('🔑 Provider Password:', password ? '***' : 'not set');
    
    const endpoints = [
        '',                                     // 1. Basic info
        '&action=get_live_streams',             // 2. Live streams
        '&action=get_live_categories',          // 3. Live categories
        '&action=get_vod_streams',              // 4. VOD streams
        '&action=get_vod_categories',           // 5. VOD categories
        '&action=get_series',                   // 6. Series
        '&action=get_series_categories'         // 7. Series categories
    ];
    
    const datasets = [];
    
    // First 7 calls to player_api.php
    for (let i = 0; i < endpoints.length; i++) {
        const url = `${baseUrl}/player_api.php?username=${username}&password=${password}${endpoints[i]}`;
        const callName = endpoints[i] ? endpoints[i].replace('&action=', '') : 'basic_info';
        
        console.log(`📡 API Call ${i + 1}/8: ${callName}`);
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Provider API call ${i + 1} failed: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.text();
        datasets.push(data);
        
        console.log(`✅ Call ${i + 1} completed: ${Math.round(data.length / 1024)}KB`);
        
        // Small delay between requests
        if (i < endpoints.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }
    
    // 8th call: M3U playlist (different endpoint)
    console.log('📡 API Call 8/8: m3u_playlist');
    const m3uUrl = `${baseUrl}/get.php?username=${username}&password=${password}&type=m3u_plus&output=ts`;
    const m3uResponse = await fetch(m3uUrl);
    
    if (!m3uResponse.ok) {
        throw new Error(`M3U playlist call failed: ${m3uResponse.status} ${m3uResponse.statusText}`);
    }
    
    const m3uData = await m3uResponse.text();
    datasets.push(m3uData);
    
    console.log(`✅ Call 8 completed: ${Math.round(m3uData.length / 1024)}KB`);
    console.log('✅ All provider data collected successfully');
    
    return datasets;
}

// ADD this method to your existing iptv-editor-service.js file
async submitToAutoUpdater(baseUrl, datasets) {
    console.log('🚀 Submitting to IPTV Editor auto-updater...');
    
    const FormData = require('form-data');
    const formData = new FormData();
    formData.append('url', baseUrl);
    formData.append('info', datasets[0]);                  // Basic info
    formData.append('get_live_streams', datasets[1]);      // Live streams
    formData.append('get_live_categories', datasets[2]);   // Live categories  
    formData.append('get_vod_streams', datasets[3]);       // VOD streams
    formData.append('get_vod_categories', datasets[4]);    // VOD categories
    formData.append('get_series', datasets[5]);            // Series
    formData.append('get_series_categories', datasets[6]); // Series categories
    formData.append('m3u', datasets[7]);                   // M3U playlist
    
    try {
        const response = await fetch(`https://editor.iptveditor.com/api/auto-updater/run-auto-updater`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.bearerToken}`,
                'Origin': 'https://cloud.iptveditor.com'
            },
            body: formData,
            timeout: 600000 // 10 minutes timeout
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`IPTV Editor API error: ${response.status} ${response.statusText}. ${errorText}`);
        }
        
        const result = await response.json();
        console.log('✅ Auto-updater submission completed successfully');
        
        return { data: result };
        
    } catch (error) {
        console.error('❌ Auto-updater submission failed:', error);
        throw error;
    }
}

}

// Export singleton instance
module.exports = new IPTVEditorService();