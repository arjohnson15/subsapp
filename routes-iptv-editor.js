// routes-iptv-editor.js
// API routes for IPTV Editor integration

const express = require('express');
const router = express.Router();
const db = require('./database-config');
const iptvEditorService = require('./iptv-editor-service');

// Middleware to check if IPTV Editor is enabled
async function checkIPTVEditorEnabled(req, res, next) {
    try {
        const enabled = await iptvEditorService.getSetting('sync_enabled');
        if (!enabled) {
            return res.status(503).json({ 
                success: false, 
                message: 'IPTV Editor integration is disabled' 
            });
        }
        next();
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Failed to check IPTV Editor status' 
        });
    }
}

// Settings Routes
router.get('/settings', async (req, res) => {
    try {
        const settings = await iptvEditorService.getAllSettings();
        res.json({ success: true, data: settings });
    } catch (error) {
        console.error('Error getting IPTV Editor settings:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get settings' 
        });
    }
});

router.post('/settings', async (req, res) => {
    try {
        const { settings } = req.body;
        
        if (!settings || typeof settings !== 'object') {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid settings data' 
            });
        }
        
        // Update each setting
        for (const [key, value] of Object.entries(settings)) {
            // Determine type based on value
            let type = 'string';
            if (typeof value === 'boolean') type = 'boolean';
            else if (typeof value === 'number') type = 'integer';
            else if (typeof value === 'object') type = 'json';
            
            await iptvEditorService.setSetting(key, value, type);
        }
        
        // Re-initialize service with new settings
        await iptvEditorService.initialize();
        
        res.json({ 
            success: true, 
            message: 'Settings updated successfully' 
        });
    } catch (error) {
        console.error('Error updating IPTV Editor settings:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to update settings' 
        });
    }
});

// Test connection
router.post('/test-connection', async (req, res) => {
    try {
        const result = await iptvEditorService.testConnection();
        res.json(result);
    } catch (error) {
        console.error('Error testing IPTV Editor connection:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Connection test failed' 
        });
    }
});

// Data Routes (require enabled service)
router.get('/categories', checkIPTVEditorEnabled, async (req, res) => {
    try {
        const categories = await iptvEditorService.getCategories();
        res.json({ success: true, data: categories });
    } catch (error) {
        console.error('Error getting categories:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get categories' 
        });
    }
});

router.get('/channels', checkIPTVEditorEnabled, async (req, res) => {
    try {
        const channels = await iptvEditorService.getChannels();
        res.json({ success: true, data: channels });
    } catch (error) {
        console.error('Error getting channels:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get channels' 
        });
    }
});

router.get('/playlists', checkIPTVEditorEnabled, async (req, res) => {
    try {
        const playlists = await iptvEditorService.getPlaylists();
        res.json({ success: true, data: playlists });
    } catch (error) {
        console.error('Error getting playlists:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get playlists' 
        });
    }
});

// Playlist sync
router.post('/sync-playlists', checkIPTVEditorEnabled, async (req, res) => {
    try {
        const result = await iptvEditorService.updatePlaylists();
        res.json({ 
            success: true, 
            message: 'Playlists synced successfully',
            data: result 
        });
    } catch (error) {
        console.error('Error syncing playlists:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to sync playlists' 
        });
    }
});

// User Management Routes
router.get('/users', checkIPTVEditorEnabled, async (req, res) => {
    try {
        // Get users from IPTV Editor API
        const apiUsers = await iptvEditorService.getAllUsers();
        
        // Get local database users with IPTV Editor accounts
        const localUsers = await db.query(`
            SELECT u.id, u.name, u.email, 
                   ieu.iptv_editor_id, ieu.iptv_editor_username,
                   ieu.expiry_date, ieu.max_connections, ieu.sync_status,
                   ieu.last_sync_time
            FROM users u
            LEFT JOIN iptv_editor_users ieu ON u.id = ieu.user_id
            WHERE u.iptv_editor_enabled = TRUE
            ORDER BY u.name
        `);
        
        res.json({ 
            success: true, 
            data: {
                api_users: apiUsers,
                local_users: localUsers
            }
        });
    } catch (error) {
        console.error('Error getting IPTV Editor users:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get users' 
        });
    }
});

router.post('/users', checkIPTVEditorEnabled, async (req, res) => {
    try {
        const { user_id, username, password, max_connections, expiry_date } = req.body;
        
        if (!user_id || !username || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing required fields: user_id, username, password' 
            });
        }
        
        // Check if user exists
        const userExists = await db.query('SELECT id FROM users WHERE id = ?', [user_id]);
        if (userExists.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        // Check if user already has IPTV Editor account
        const existingAccount = await iptvEditorService.getIPTVEditorUser(user_id);
        if (existingAccount) {
            return res.status(409).json({ 
                success: false, 
                message: 'User already has IPTV Editor account' 
            });
        }
        
        const userData = {
            user_id,
            username,
            password,
            max_connections: max_connections || 1,
            expiry_date: expiry_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        };
        
        const result = await iptvEditorService.createUser(userData);
        
        // Enable IPTV Editor for this user
        await db.query('UPDATE users SET iptv_editor_enabled = TRUE WHERE id = ?', [user_id]);
        
        res.json({ 
            success: true, 
            message: 'User created successfully',
            data: result 
        });
    } catch (error) {
        console.error('Error creating IPTV Editor user:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Failed to create user' 
        });
    }
});

router.delete('/users/:id', checkIPTVEditorEnabled, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        
        if (!userId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid user ID' 
            });
        }
        
        const result = await iptvEditorService.deleteUser(userId);
        
        // Disable IPTV Editor for this user
        await db.query('UPDATE users SET iptv_editor_enabled = FALSE WHERE id = ?', [userId]);
        
        res.json({ 
            success: true, 
            message: 'User deleted successfully',
            data: result 
        });
    } catch (error) {
        console.error('Error deleting IPTV Editor user:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Failed to delete user' 
        });
    }
});

router.post('/users/:id/sync', checkIPTVEditorEnabled, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        
        if (!userId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid user ID' 
            });
        }
        
        const result = await iptvEditorService.syncUser(userId);
        
        res.json({ 
            success: true, 
            message: 'User synced successfully',
            data: result 
        });
    } catch (error) {
        console.error('Error syncing IPTV Editor user:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Failed to sync user' 
        });
    }
});

router.get('/users/:id/status', checkIPTVEditorEnabled, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        
        if (!userId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid user ID' 
            });
        }
        
        const iptvUser = await iptvEditorService.getIPTVEditorUser(userId);
        
        if (!iptvUser) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found in IPTV Editor' 
            });
        }
        
        res.json({ 
            success: true, 
            data: iptvUser 
        });
    } catch (error) {
        console.error('Error getting IPTV Editor user status:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get user status' 
        });
    }
});

// Manual sync all users
router.post('/manual-sync', checkIPTVEditorEnabled, async (req, res) => {
    try {
        const enabledUsers = await db.query(`
            SELECT u.id, u.name 
            FROM users u 
            WHERE u.iptv_editor_enabled = TRUE AND u.include_in_iptv_editor = TRUE
        `);
        
        const results = [];
        
        for (const user of enabledUsers) {
            try {
                const iptvUser = await iptvEditorService.getIPTVEditorUser(user.id);
                if (iptvUser) {
                    await iptvEditorService.syncUser(user.id);
                    results.push({ 
                        user_id: user.id, 
                        name: user.name, 
                        status: 'synced' 
                    });
                } else {
                    results.push({ 
                        user_id: user.id, 
                        name: user.name, 
                        status: 'no_account' 
                    });
                }
            } catch (error) {
                results.push({ 
                    user_id: user.id, 
                    name: user.name, 
                    status: 'error',
                    error: error.message 
                });
            }
        }
        
        res.json({ 
            success: true, 
            message: `Sync completed for ${results.length} users`,
            data: results 
        });
    } catch (error) {
        console.error('Error in manual sync:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to perform manual sync' 
        });
    }
});

// Sync logs
router.get('/sync-logs', async (req, res) => {
    try {
        const { limit = 50, offset = 0, sync_type, status } = req.query;
        
        let query = `
            SELECT sl.*, u.name as user_name 
            FROM iptv_sync_logs sl
            LEFT JOIN users u ON sl.user_id = u.id
        `;
        
        const conditions = [];
        const params = [];
        
        if (sync_type) {
            conditions.push('sl.sync_type = ?');
            params.push(sync_type);
        }
        
        if (status) {
            conditions.push('sl.status = ?');
            params.push(status);
        }
        
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        
        query += ' ORDER BY sl.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));
        
        const logs = await db.query(query, params);
        
        // Get total count
        let countQuery = 'SELECT COUNT(*) as total FROM iptv_sync_logs sl';
        const countParams = [];
        
        if (conditions.length > 0) {
            countQuery += ' WHERE ' + conditions.join(' AND ');
            conditions.forEach(() => countParams.push(params.shift()));
        }
        
        const countResult = await db.query(countQuery, countParams);
        const total = countResult[0].total;
        
        res.json({ 
            success: true, 
            data: {
                logs,
                pagination: {
                    total,
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    has_more: (parseInt(offset) + parseInt(limit)) < total
                }
            }
        });
    } catch (error) {
        console.error('Error getting sync logs:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get sync logs' 
        });
    }
});

// Clear old logs
router.delete('/sync-logs', async (req, res) => {
    try {
        const { days_old = 30 } = req.body;
        
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - parseInt(days_old));
        
        const result = await db.query(
            'DELETE FROM iptv_sync_logs WHERE created_at < ?',
            [cutoffDate]
        );
        
        res.json({ 
            success: true, 
            message: `Deleted ${result.affectedRows} old log entries`,
            deleted_count: result.affectedRows 
        });
    } catch (error) {
        console.error('Error clearing sync logs:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to clear sync logs' 
        });
    }
});

// Bulk operations
router.post('/bulk-create-users', checkIPTVEditorEnabled, async (req, res) => {
    try {
        const { user_ids, default_password, max_connections, expiry_months } = req.body;
        
        if (!user_ids || !Array.isArray(user_ids)) {
            return res.status(400).json({ 
                success: false, 
                message: 'user_ids must be an array' 
            });
        }
        
        const results = [];
        const expiry_date = new Date();
        expiry_date.setMonth(expiry_date.getMonth() + (expiry_months || 1));
        
        for (const user_id of user_ids) {
            try {
                // Get user info
                const userInfo = await db.query('SELECT name, email FROM users WHERE id = ?', [user_id]);
                if (userInfo.length === 0) {
                    results.push({ user_id, status: 'error', error: 'User not found' });
                    continue;
                }
                
                // Check if already has account
                const existingAccount = await iptvEditorService.getIPTVEditorUser(user_id);
                if (existingAccount) {
                    results.push({ user_id, status: 'exists', error: 'Already has IPTV Editor account' });
                    continue;
                }
                
                const username = iptvEditorService.generateIPTVUsername(userInfo[0].name);
                const password = default_password || iptvEditorService.generateIPTVPassword();
                
                const userData = {
                    user_id,
                    username,
                    password,
                    max_connections: max_connections || 1,
                    expiry_date
                };
                
                await iptvEditorService.createUser(userData);
                await db.query('UPDATE users SET iptv_editor_enabled = TRUE WHERE id = ?', [user_id]);
                
                results.push({ 
                    user_id, 
                    status: 'created',
                    username,
                    password
                });
            } catch (error) {
                results.push({ 
                    user_id, 
                    status: 'error', 
                    error: error.message 
                });
            }
        }
        
        res.json({ 
            success: true, 
            message: `Bulk operation completed for ${user_ids.length} users`,
            data: results 
        });
    } catch (error) {
        console.error('Error in bulk create users:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to perform bulk create operation' 
        });
    }
});

module.exports = router;