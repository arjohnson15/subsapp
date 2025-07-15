// services/iptv-editor-service.js
// IPTV Editor API Service for JohnsonFlix Manager
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
    
    async initialize() {
        try {
            this.bearerToken = await this.getSetting('bearer_token');
            this.defaultPlaylistId = await this.getSetting('default_playlist_id');
            
            if (!this.bearerToken) {
                console.warn('IPTV Editor bearer token not configured');
                return false;
            }
            
            this.initialized = true;
            return true;
        } catch (error) {
            console.error('Failed to initialize IPTV Editor service:', error);
            return false;
        }
    }
    
    // Settings Management
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
            console.error(`Error getting setting ${key}:`, error);
            return null;
        }
    }
    
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
            return true;
        } catch (error) {
            console.error(`Error setting ${key}:`, error);
            return false;
        }
    }
    
    // HTTP Request Helpers
    getHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.bearerToken}`,
            'Origin': 'https://cloud.iptveditor.com',
            'Accept': 'application/json, text/plain, */*'
        };
    }
    
    async makeRequest(endpoint, data = {}, method = 'POST') {
        if (!this.initialized) {
            const init = await this.initialize();
            if (!init) throw new Error('IPTV Editor service not properly configured');
        }
        
        const startTime = Date.now();
        const url = `${this.baseURL}${endpoint}`;
        
        try {
            const config = {
                method,
                url,
                headers: this.getHeaders(),
                timeout: 30000
            };
            
            if (method === 'POST' && Object.keys(data).length > 0) {
                config.data = data;
            }
            
            const response = await axios(config);
            const duration = Date.now() - startTime;
            
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
            
            return response.data;
        } catch (error) {
            const duration = Date.now() - startTime;
            const errorMessage = error.response?.data?.message || error.message;
            
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
        return 'scheduled_sync';
    }
    
    // Logging
    async logSync(syncType, userId, status, requestData, responseData, errorMessage = null, durationMs = 0) {
        try {
            await db.query(
                `INSERT INTO iptv_sync_logs (sync_type, user_id, status, request_data, response_data, error_message, duration_ms)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [syncType, userId, status, JSON.stringify(requestData), JSON.stringify(responseData), errorMessage, durationMs]
            );
        } catch (error) {
            console.error('Failed to log sync:', error);
        }
    }
    
    // API Methods
    
    // 1. Create New User
    async createUser(userData) {
        const data = {
            playlist_id: this.defaultPlaylistId,
            username: userData.username,
            password: userData.password,
            max_connections: userData.max_connections || 1,
            expiry_date: userData.expiry_date,
            user_id: userData.user_id
        };
        
        const response = await this.makeRequest('/api/reseller/new-customer', data);
        
        // Store in database
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
        }
        
        return response;
    }
    
    // 2. Delete User
    async deleteUser(userId) {
        const iptvUser = await this.getIPTVEditorUser(userId);
        if (!iptvUser) {
            throw new Error('User not found in IPTV Editor');
        }
        
        const data = {
            user_id: iptvUser.iptv_editor_id
        };
        
        const response = await this.makeRequest('/api/reseller/remove', data);
        
        // Remove from database
        if (response && response.success) {
            await db.query('DELETE FROM iptv_editor_users WHERE user_id = ?', [userId]);
        }
        
        return response;
    }
    
    // 3. Get All Users
    async getAllUsers() {
        return await this.makeRequest('/api/reseller/get-data', {});
    }
    
    // 4. Sync User
    async syncUser(userId) {
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
        
        return response;
    }
    
    // 5. Get Playlists
    async getPlaylists() {
        return await this.makeRequest('/api/playlist/list', {});
    }
    
    // 6. Get Categories
    async getCategories() {
        return await this.makeRequest('/api/category/channel/get-data', {});
    }
    
    // 7. Get Channels
    async getChannels() {
        return await this.makeRequest('/api/stream/channel/get-data', {});
    }
    
    // 8. Update Playlists
    async updatePlaylists() {
        const response = await this.makeRequest('/api/auto-updater/run-auto-updater', {});
        await this.setSetting('last_sync_time', new Date().toISOString(), 'string');
        return response;
    }
    
    // Database Helper Methods
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
            return true;
        } catch (error) {
            console.error('Error creating IPTV Editor user:', error);
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
            console.error('Error getting IPTV Editor user:', error);
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
            return true;
        } catch (error) {
            console.error('Error updating IPTV Editor user:', error);
            return false;
        }
    }
    
    // Utility Methods
    generateIPTVUsername(name) {
        const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const random = Math.floor(Math.random() * 1000);
        return `${cleanName}${random}`;
    }
    
    generateIPTVPassword() {
        return Math.random().toString(36).substring(2, 10);
    }
    
    // Status and Health Check
    async isServiceEnabled() {
        return await this.getSetting('sync_enabled');
    }
    
    async testConnection() {
        try {
            await this.getPlaylists();
            return { success: true, message: 'Connection successful' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }
    
    // Get all settings for frontend
    async getAllSettings() {
        try {
            const results = await db.query('SELECT * FROM iptv_editor_settings ORDER BY setting_key');
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
                        settings[setting_key] = setting_value;
                }
            });
            
            return settings;
        } catch (error) {
            console.error('Error getting all settings:', error);
            return {};
        }
    }
}

module.exports = new IPTVEditorService();