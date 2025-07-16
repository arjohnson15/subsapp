// iptv-editor-service.js
// CORRECTED IPTV Editor API Service for JohnsonFlix Manager
// Handles all interactions with editor.iptveditor.com API

const axios = require('axios');
const db = require('./database-config');

class IPTVEditorService {
    constructor() {
        this.baseURL = 'https://editor.iptveditor.com';
        this.bearerToken = null;
        this.defaultPlaylistId = null;
        this.initialized = false;
    }
    
    // =============================================================================
    // INITIALIZATION & SETTINGS
    // =============================================================================
    
    async initialize() {
        try {
            console.log('🎬 Initializing IPTV Editor service...');
            
            this.bearerToken = await this.getSetting('bearer_token');
            this.defaultPlaylistId = await this.getSetting('default_playlist_id');
            
            if (!this.bearerToken) {
                console.warn('⚠️ IPTV Editor bearer token not configured');
                return false;
            }
            
            this.initialized = true;
            console.log('✅ IPTV Editor service initialized successfully');
            return true;
            
        } catch (error) {
            console.error('❌ Failed to initialize IPTV Editor service:', error);
            return false;
        }
    }
    
    // Get setting from database
    async getSetting(key) {
        try {
            const result = await db.query(
                'SELECT setting_value, setting_type FROM iptv_editor_settings WHERE setting_key = ?',
                [key]
            );
            
            if (result.length === 0) return null;
            
            const { setting_value, setting_type } = result[0];
            
            switch (setting_type) {
                case 'json':
                    return JSON.parse(setting_value || '{}');
                case 'boolean':
                    return setting_value === 'true';
                case 'integer':
                    return parseInt(setting_value) || 0;
                default:
                    return setting_value;
            }
            
        } catch (error) {
            console.error(`❌ Error getting setting ${key}:`, error);
            return null;
        }
    }
    
    // Set setting in database
    async setSetting(key, value, type = 'string') {
        try {
            const setting_value = type === 'json' ? JSON.stringify(value) : String(value);
            
            await db.query(
                `INSERT INTO iptv_editor_settings (setting_key, setting_value, setting_type) 
                 VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE 
                 setting_value = VALUES(setting_value), 
                 setting_type = VALUES(setting_type)`,
                [key, setting_value, type]
            );
            
            console.log(`✅ Setting ${key} updated successfully`);
            return true;
            
        } catch (error) {
            console.error(`❌ Error setting ${key}:`, error);
            return false;
        }
    }
    
    // Get all settings for frontend
    async getAllSettings() {
        try {
            const results = await db.query(
                'SELECT setting_key, setting_value, setting_type FROM iptv_editor_settings ORDER BY setting_key'
            );
            
            const settings = {};
            
            results.forEach(row => {
                const { setting_key, setting_value, setting_type } = row;
                
                switch (setting_type) {
                    case 'json':
                        settings[setting_key] = JSON.parse(setting_value || '{}');
                        break;
                    case 'boolean':
                        settings[setting_key] = setting_value === 'true';
                        break;
                    case 'integer':
                        settings[setting_key] = parseInt(setting_value) || 0;
                        break;
                    default:
                        settings[setting_key] = setting_value || '';
                }
            });
            
            return settings;
            
        } catch (error) {
            console.error('❌ Error getting all settings:', error);
            return {};
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
    config.data = Object.keys(data).length > 0 ? data : '';
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
    const errorMessage = error.response?.data?.message || error.message;
    
    // Enhanced error logging
    console.error(`❌ Request to ${endpoint} failed (${duration}ms):`, errorMessage);
    
    if (error.response) {
        console.error(`   Status: ${error.response.status}`);
        console.error(`   Status Text: ${error.response.statusText}`);
        console.error(`   Response Headers:`, JSON.stringify(error.response.headers, null, 2));
        console.error(`   Response Data:`, JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
        console.error(`   No response received`);
        console.error(`   Request details:`, error.request);
    } else {
        console.error(`   Error setting up request:`, error.message);
    }
    
    // Log failed request
    await this.logSync(
        this.getLogTypeFromEndpoint(endpoint),
        data.user_id || null,
        'error',
        data,
        error.response?.data || null,
        errorMessage,
        duration
    );
    
    throw new Error(`IPTV Editor API Error: ${errorMessage}`);
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
    async deleteUser(userId) {
        try {
            console.log(`🗑️ Deleting IPTV Editor user ${userId}...`);
            
            const iptvUser = await this.getIPTVEditorUser(userId);
            if (!iptvUser) {
                throw new Error('User not found in IPTV Editor');
            }
            
            const data = {
                user_id: iptvUser.iptv_editor_id
            };
            
            const response = await this.makeRequest('/api/reseller/remove', data);
            
            // Remove from database if successful
            if (response && response.success) {
                await db.query('DELETE FROM iptv_editor_users WHERE user_id = ?', [userId]);
                console.log(`✅ User ${userId} deleted successfully`);
            }
            
            return response;
            
        } catch (error) {
            console.error(`❌ Failed to delete user ${userId}:`, error);
            throw error;
        }
    }
    
    // 3. Get All Users
    async getAllUsers() {
        try {
            console.log('👥 Fetching all IPTV Editor users...');
            
            const response = await this.makeRequest('/api/reseller/get-data', {});
            
            console.log(`✅ Fetched ${response?.users?.length || 0} users from IPTV Editor`);
            return response;
            
        } catch (error) {
            console.error('❌ Failed to get all users:', error);
            throw error;
        }
    }
    
    // 4. Sync User
    async syncUser(userId) {
        try {
            console.log(`🔄 Syncing IPTV Editor user ${userId}...`);
            
            const iptvUser = await this.getIPTVEditorUser(userId);
            if (!iptvUser) {
                throw new Error('User not found in IPTV Editor');
            }
            
            const data = {
                user_id: iptvUser.iptv_editor_id
            };
            
            const response = await this.makeRequest('/api/reseller/force-sync', data);
            
            // Update sync status
            await db.query(
                'UPDATE iptv_editor_users SET sync_status = ?, last_sync_time = NOW() WHERE user_id = ?',
                ['synced', userId]
            );
            
            console.log(`✅ User ${userId} synced successfully`);
            return response;
            
        } catch (error) {
            console.error(`❌ Failed to sync user ${userId}:`, error);
            
            // Update sync status to error
            await db.query(
                'UPDATE iptv_editor_users SET sync_status = ?, last_sync_time = NOW() WHERE user_id = ?',
                ['error', userId]
            );
            
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
            console.log('🔄 Updating IPTV Editor playlists...');
            
            const response = await this.makeRequest('/api/auto-updater/run-auto-updater', {});
            
            // Update last sync time
            await this.setSetting('last_sync_time', new Date().toISOString(), 'string');
            
            console.log('✅ Playlists updated successfully');
            return response;
            
        } catch (error) {
            console.error('❌ Failed to update playlists:', error);
            throw error;
        }
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
}

// Export singleton instance
module.exports = new IPTVEditorService();