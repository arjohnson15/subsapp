// routes-iptv-editor.js
// API routes for IPTV Editor integration

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('./database-config');
const iptvEditorService = require('./iptv-editor-service');

// Validation middleware
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array()
        });
    }
    next();
};

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
};

// Settings Routes
router.get('/settings', async (req, res) => {
    try {
        console.log('⚙️ Loading IPTV Editor settings...');
        
        const settings = await iptvEditorService.getAllSettings();
        
        res.json({ 
            success: true, 
            settings: settings,
            message: 'Settings loaded successfully'
        });
        
    } catch (error) {
        console.error('❌ Error getting IPTV Editor settings:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get settings',
            error: error.message
        });
    }
});

router.post('/settings', [
    body('bearer_token').optional().isString().notEmpty().withMessage('Bearer token must be a non-empty string'),
    body('default_playlist_id').optional().isString().withMessage('Playlist ID must be a string'),
    body('default_playlist_name').optional().isString().withMessage('Playlist name must be a string'),
    body('sync_enabled').optional().isBoolean().withMessage('Sync enabled must be a boolean'),
    body('sync_schedule_hours').optional().isInt({ min: 1, max: 168 }).withMessage('Sync schedule must be between 1 and 168 hours'),
    handleValidationErrors
], async (req, res) => {
    try {
        console.log('💾 Updating IPTV Editor settings...');
        
        const updates = req.body;
        
        // Validate at least one field is provided
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No settings provided for update'
            });
        }
        
        // Update each setting
        for (const [key, value] of Object.entries(updates)) {
            let type = 'string';
            if (typeof value === 'boolean') type = 'boolean';
            else if (typeof value === 'number') type = 'integer';
            else if (typeof value === 'object') type = 'json';
            
            await iptvEditorService.setSetting(key, value, type);
        }
        
        // Re-initialize service with new settings
        await iptvEditorService.initialize();
        
        // Return updated settings
        const updatedSettings = await iptvEditorService.getAllSettings();
        
        res.json({ 
            success: true, 
            message: 'Settings updated successfully',
            settings: updatedSettings
        });
        
    } catch (error) {
        console.error('❌ Error updating IPTV Editor settings:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to update settings',
            error: error.message
        });
    }
});

// Test connection
router.post('/test-connection', async (req, res) => {
    try {
        console.log('🔧 Testing IPTV Editor connection...');
        
        const result = await iptvEditorService.testConnection();
        
        if (result.success) {
            console.log('✅ Connection test successful');
        } else {
            console.log('❌ Connection test failed:', result.message);
        }
        
        res.json(result);
        
    } catch (error) {
        console.error('❌ Error testing IPTV Editor connection:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Connection test failed',
            error: error.message
        });
    }
});

// Data Routes (require enabled service)
router.get('/categories', checkIPTVEditorEnabled, async (req, res) => {
    try {
        console.log('📺 Loading IPTV Editor categories...');
        
        const categories = await iptvEditorService.getCategories();
        
        res.json({ 
            success: true, 
            data: categories,
            message: 'Categories loaded successfully'
        });
        
    } catch (error) {
        console.error('❌ Error getting categories:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get categories',
            error: error.message
        });
    }
});

router.get('/channels', checkIPTVEditorEnabled, async (req, res) => {
    try {
        console.log('📺 Loading IPTV Editor channels...');
        
        const channels = await iptvEditorService.getChannels();
        
        res.json({ 
            success: true, 
            data: channels,
            message: 'Channels loaded successfully'
        });
        
    } catch (error) {
        console.error('❌ Error getting channels:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get channels',
            error: error.message
        });
    }
});

router.get('/playlists', checkIPTVEditorEnabled, async (req, res) => {
    try {
        console.log('📺 Loading stored IPTV Editor playlists...');
        
        const playlists = await db.query(`
            SELECT playlist_id, name, customer_count, channel_count, 
                   movie_count, series_count, expiry_date, is_active, last_synced
            FROM iptv_editor_playlists 
            WHERE is_active = TRUE
            ORDER BY name
        `);
        
        res.json({ 
            success: true, 
            data: playlists,
            message: 'Playlists loaded successfully'
        });
        
    } catch (error) {
        console.error('❌ Error getting stored playlists:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get playlists',
            error: error.message
        });
    }
});

// Playlist sync
router.post('/sync-playlists', checkIPTVEditorEnabled, async (req, res) => {
    try {
        console.log('🔄 Syncing IPTV Editor playlists...');
        
        const result = await iptvEditorService.getPlaylists();
        
        console.log('🔍 Raw result from getPlaylists:', JSON.stringify(result, null, 2));
        console.log('🔍 Result has playlist property:', !!result.playlist);
        console.log('🔍 Playlist array length:', result.playlist ? result.playlist.length : 'N/A');
        
        if (!result.playlist || !Array.isArray(result.playlist)) {
            throw new Error('Invalid playlist data received from IPTV Editor API');
        }
        
        // Clear existing playlists and insert new ones
        await db.query('DELETE FROM iptv_editor_playlists');
        
        // Insert each playlist into database
        for (const playlist of result.playlist) {
            await db.query(`
                INSERT INTO iptv_editor_playlists (
                    playlist_id, name, username, password, m3u_code, epg_code, 
                    expiry_date, max_connections, customer_count, channel_count, 
                    movie_count, series_count, last_synced
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
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
                playlist.series || 0
            ]);
        }
        
        console.log(`✅ Stored ${result.playlist.length} playlists in database`);
        
        res.json({ 
            success: true, 
            message: 'Playlists synced successfully',
            count: result.playlist.length,
            playlists: result.playlist
        });
        
    } catch (error) {
        console.error('❌ Error syncing playlists:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to sync playlists',
            error: error.message
        });
    }
});

// GET /api/iptv-editor/playlists - Get stored playlists from database
router.get('/playlists', async (req, res) => {
    try {
        console.log('📺 Loading stored playlists from database...');
        
        const playlists = await iptvEditorService.getStoredPlaylists();
        
        res.json({ 
            success: true, 
            data: playlists,
            message: 'Stored playlists loaded successfully'
        });
        
    } catch (error) {
        console.error('❌ Error getting stored playlists:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get stored playlists',
            error: error.message
        });
    }
});

// User Management Routes
router.get('/users', checkIPTVEditorEnabled, async (req, res) => {
    try {
        console.log('👥 Loading IPTV Editor users...');
        
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
            },
            message: 'Users loaded successfully'
        });
        
    } catch (error) {
        console.error('❌ Error getting IPTV Editor users:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get users',
            error: error.message
        });
    }
});

router.post('/users', [
    body('user_id').isInt({ min: 1 }).withMessage('User ID must be a positive integer'),
    body('username').isString().notEmpty().withMessage('Username is required'),
    body('password').isString().notEmpty().withMessage('Password is required'),
    body('max_connections').optional().isInt({ min: 1, max: 10 }).withMessage('Max connections must be between 1 and 10'),
    body('expiry_date').optional().isISO8601().withMessage('Expiry date must be valid ISO date'),
    handleValidationErrors
], checkIPTVEditorEnabled, async (req, res) => {
    try {
        console.log('👤 Creating IPTV Editor user...');
        
        const { user_id, username, password, max_connections, expiry_date } = req.body;
        
        // Check if user exists
        const userExists = await db.query('SELECT id, name FROM users WHERE id = ?', [user_id]);
        if (userExists.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found in system' 
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
            expiry_date: expiry_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days default
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
        console.error('❌ Error creating IPTV Editor user:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to create user',
            error: error.message
        });
    }
});

router.delete('/users/:id', checkIPTVEditorEnabled, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        
        if (!userId || isNaN(userId)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid user ID' 
            });
        }
        
        console.log(`🗑️ Deleting IPTV Editor user ${userId}...`);
        
        const result = await iptvEditorService.deleteUser(userId);
        
        // Disable IPTV Editor for this user
        await db.query('UPDATE users SET iptv_editor_enabled = FALSE WHERE id = ?', [userId]);
        
        res.json({ 
            success: true, 
            message: 'User deleted successfully',
            data: result 
        });
        
    } catch (error) {
        console.error('❌ Error deleting IPTV Editor user:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to delete user',
            error: error.message
        });
    }
});


router.post('/users/:id/sync', checkIPTVEditorEnabled, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        
        if (!userId || isNaN(userId)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid user ID' 
            });
        }
        
        console.log(`🔄 Syncing IPTV Editor user ${userId}...`);
        
        const result = await iptvEditorService.syncUser(userId);
        
        res.json({ 
            success: true, 
            message: 'User synced successfully',
            data: result 
        });
        
    } catch (error) {
        console.error('❌ Error syncing IPTV Editor user:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to sync user',
            error: error.message
        });
    }
});

router.get('/users/:id/status', checkIPTVEditorEnabled, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        
        if (!userId || isNaN(userId)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid user ID' 
            });
        }
        
        console.log(`📊 Getting IPTV Editor user ${userId} status...`);
        
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
        console.error('❌ Error getting IPTV Editor user status:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get user status',
            error: error.message
        });
    }
});


// Manual sync all users
router.post('/manual-sync', checkIPTVEditorEnabled, async (req, res) => {
    try {
        console.log('🔄 Starting manual sync for all IPTV Editor users...');
        
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
        console.error('❌ Error in manual sync:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to perform manual sync',
            error: error.message
        });
    }
});

// Sync logs
router.get('/sync-logs', async (req, res) => {
    try {
        console.log('📋 Loading IPTV Editor sync logs...');
        
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
            // Re-add the filter parameters for count query
            if (sync_type) countParams.push(sync_type);
            if (status) countParams.push(status);
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
            },
            message: 'Logs loaded successfully'
        });
        
    } catch (error) {
        console.error('❌ Error getting sync logs:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get sync logs',
            error: error.message
        });
    }
});


// Clear old logs
router.delete('/sync-logs', [
    body('days_old').optional().isInt({ min: 1, max: 365 }).withMessage('Days old must be between 1 and 365'),
    handleValidationErrors
], async (req, res) => {
    try {
        const { days_old = 30 } = req.body;
        
        console.log(`🗑️ Clearing IPTV Editor logs older than ${days_old} days...`);
        
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
        console.error('❌ Error clearing sync logs:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to clear sync logs',
            error: error.message
        });
    }
});

// Bulk operations
router.post('/bulk-create-users', [
    body('user_ids').isArray({ min: 1 }).withMessage('User IDs must be a non-empty array'),
    body('user_ids.*').isInt({ min: 1 }).withMessage('Each user ID must be a positive integer'),
    body('default_password').optional().isString().withMessage('Default password must be a string'),
    body('max_connections').optional().isInt({ min: 1, max: 10 }).withMessage('Max connections must be between 1 and 10'),
    body('expiry_months').optional().isInt({ min: 1, max: 12 }).withMessage('Expiry months must be between 1 and 12'),
    handleValidationErrors
], checkIPTVEditorEnabled, async (req, res) => {
    try {
        console.log('👥 Starting bulk create IPTV Editor users...');
        
        const { user_ids, default_password, max_connections, expiry_months } = req.body;
        
        const results = [];
        const expiry_date = new Date();
        expiry_date.setMonth(expiry_date.getMonth() + (expiry_months || 1));
        
        for (const user_id of user_ids) {
            try {
                // Get user info
                const userInfo = await db.query('SELECT name, email FROM users WHERE id = ?', [user_id]);
                if (userInfo.length === 0) {
                    results.push({ 
                        user_id, 
                        name: 'Unknown', 
                        status: 'error', 
                        error: 'User not found' 
                    });
                    continue;
                }
                
                // Check if already has account
                const existingAccount = await iptvEditorService.getIPTVEditorUser(user_id);
                if (existingAccount) {
                    results.push({ 
                        user_id, 
                        name: userInfo[0].name, 
                        status: 'exists', 
                        error: 'Already has IPTV Editor account' 
                    });
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
                    name: userInfo[0].name,
                    status: 'created',
                    username,
                    password
                });
                
            } catch (error) {
                results.push({ 
                    user_id, 
                    name: 'Unknown',
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
        console.error('❌ Error in bulk create users:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to perform bulk create operation',
            error: error.message
        });
    }
});

// Global error handler for this router
router.use((error, req, res, next) => {
    console.error('❌ IPTV Editor API Error:', error);
    
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
});

module.exports = router;