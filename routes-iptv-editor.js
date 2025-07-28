// routes-iptv-editor.js
// API routes for IPTV Editor integration

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const axios = require('axios');
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
        // Check if bearer token is configured (more meaningful than sync_enabled)
        const bearerToken = await iptvEditorService.getSetting('bearer_token');
        
        if (!bearerToken || bearerToken.trim() === '') {
            return res.status(503).json({ 
                success: false, 
                message: 'IPTV Editor integration not configured - Bearer token missing' 
            });
        }
        
        // Initialize service to ensure it's ready
        const initialized = await iptvEditorService.initialize();
        if (!initialized) {
            return res.status(503).json({ 
                success: false, 
                message: 'IPTV Editor service initialization failed' 
            });
        }
        
        next();
    } catch (error) {
        console.error('❌ Error checking IPTV Editor status:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to check IPTV Editor status',
            error: error.message
        });
    }
}

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

// Playlist sync
router.post('/sync-playlists', async (req, res) => {
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
            movie_count, series_count, patterns, last_synced
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
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
        JSON.stringify(playlist.patterns || [])  // ADD THIS LINE
    ]);
}
        
        console.log(`✅ Stored ${result.playlist.length} playlists in database`);
        
        res.json({ 
            success: true, 
            message: 'Playlists synced successfully',
            count: result.playlist.length,
            data: result  // This contains the playlist array
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


// Helper function to convert ISO date to MySQL timestamp
function convertToMySQLTimestamp(isoDateString) {
    if (!isoDateString) return null;
    const date = new Date(isoDateString);
    return date.toISOString().slice(0, 19).replace('T', ' ');
}


router.post('/user/create', [
    body('user_id').isInt({ min: 1 }).withMessage('User ID must be a positive integer'),
    body('username').isString().notEmpty().withMessage('Username is required'),
    handleValidationErrors
], checkIPTVEditorEnabled, async (req, res) => {
    try {
        const { user_id, username } = req.body;
        console.log(`👤 Creating IPTV Editor user: ${username} for local user ${user_id}`);
        
        // Get local user data
        const localUserResult = await db.query('SELECT name, email, iptv_username, iptv_password FROM users WHERE id = ?', [user_id]);
        
        if (localUserResult.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found in system'
            });
        }
        
        const localUser = localUserResult[0];
        
        // Check if user already has IPTV Editor account
        const existingAccount = await db.query(
            'SELECT * FROM iptv_editor_users WHERE user_id = ?', 
            [user_id]
        );
        
        if (existingAccount.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'User already has IPTV Editor account'
            });
        }
        
        // Get IPTV Editor settings
        const settings = await iptvEditorService.getAllSettings();
        
        if (!settings.bearer_token || !settings.default_playlist_id) {
            return res.status(400).json({
                success: false,
                message: 'IPTV Editor is not properly configured'
            });
        }
        
        // FIXED: Use the manual username for IPTV Editor, IPTV username for param1
        const iptvEditorUsername = username; // The username typed in manually
        const iptvPanelUsername = localUser.iptv_username; // The IPTV panel username
        
        if (!iptvPanelUsername) {
            return res.status(400).json({
                success: false,
                message: 'User must have an IPTV username set before creating IPTV Editor account'
            });
        }
        
        if (!localUser.iptv_password) {
            return res.status(400).json({
                success: false,
                message: 'User must have an IPTV password set before creating IPTV Editor account'
            });
        }
        
        // Check if IPTV Editor username is available
        const usernameToCheck = iptvEditorUsername;
        
        try {
            console.log(`🔍 Checking if username "${usernameToCheck}" is available...`);
            
            const validationResponse = await axios.post('https://editor.iptveditor.com/api/validator/username', {
                username: usernameToCheck
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.bearer_token}`,
                    'Origin': 'https://cloud.iptveditor.com'
                }
            });
            
            console.log(`✅ Username "${usernameToCheck}" is available`);
            
        } catch (validationError) {
            if (validationError.response && validationError.response.status === 403) {
                console.log(`❌ Username "${usernameToCheck}" is already taken`);
                return res.status(409).json({
                    success: false,
                    message: `Username "${usernameToCheck}" is already taken in IPTV Editor. Please choose a different IPTV username.`,
                    error_type: 'username_taken',
                    taken_username: usernameToCheck
                });
            } else {
                console.error('❌ Username validation failed:', validationError.message);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to validate username. Please try again.',
                    error: validationError.message
                });
            }
        }
        
        // If we get here, username is available - proceed with creation
        // Generate password for IPTV Editor user
        const iptvEditorPassword = localUser.iptv_password;
        
        const creationData = {
            playlist: settings.default_playlist_id,
            items: {
                name: localUser.email, // Use user email as display name
                note: "",
                username: iptvEditorUsername, // FIXED: Use the manually entered username
                password: iptvEditorPassword,
                message: null,
                channels_categories: [73], // Default channel categories
                vods_categories: [73], // Default VOD categories
                series_categories: [], // Empty series categories
                patterns: [
                    {
                        url: "https://pinkpony.lol",
                        param1: iptvPanelUsername, // FIXED: Use IPTV panel username as param1
                        param2: iptvEditorPassword, // Use IPTV password
                        type: "xtream"
                    }
                ],
                language: "en"
            }
        };
        
        console.log('📤 Sending IPTV Editor creation request...');
        
        // Make API call to IPTV Editor
        const response = await iptvEditorService.makeRequest('/api/reseller/new-customer', creationData);
        
        if (response && response.customer) {
            // Save to database with CORRECT username (the actual IPTV username used)
            const insertData = [
                user_id,
                response.customer.id,
                iptvEditorUsername,
                iptvEditorPassword,
                response.customer.m3u,
                response.customer.epg,
                response.customer.expiry ? new Date(response.customer.expiry * 1000) : null,
                response.customer.max_connections || 1,
                'synced',
                new Date(),
                JSON.stringify(response.customer),
                new Date()
            ];
            
            await db.query(`
                INSERT INTO iptv_editor_users (
                    user_id, iptv_editor_id, iptv_editor_username, iptv_editor_password,
                    m3u_code, epg_code, expiry_date, max_connections,
                    sync_status, last_sync_time, raw_editor_data, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, insertData);
            
            console.log(`✅ Created and saved IPTV Editor user for local user ${user_id}`);
            
            // Return success response
            res.json({
                success: true,
                user: {
                    username: usernameToCheck, // FIXED: Return actual username used
                    password: iptvEditorPassword,
                    max_connections: response.customer.max_connections || 1,
                    expiry: response.customer.expiry || null,
                    iptv_editor_id: response.customer.id || null,
                    m3u_url: response.customer.m3u ? `https://editor.iptveditor.com/m3u/${response.customer.m3u}` : null,
                    epg_url: response.customer.epg ? `https://editor.iptveditor.com/epg/${response.customer.epg}` : null,
                    last_updated: new Date().toLocaleDateString()
                },
                message: `IPTV Editor account created successfully for ${usernameToCheck}`
            });
            
        } else {
            throw new Error(response.message || 'Failed to create user in IPTV Editor');
        }
        
    } catch (error) {
        console.error('❌ Error creating IPTV Editor user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create IPTV Editor user',
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

router.get('/user/:userId/status', checkIPTVEditorEnabled, async (req, res) => {
    try {
        const { userId } = req.params;
        
        const result = await db.query(
            'SELECT * FROM iptv_editor_users WHERE user_id = ?',
            [userId]
        );
        
        res.json({
            success: true,
            iptvUser: result.length > 0 ? result[0] : null
        });
        
    } catch (error) {
        console.error('Error getting IPTV Editor user status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get user status',
            error: error.message
        });
    }
});

// Helper function to convert ISO date to MySQL timestamp
function convertToMySQLTimestamp(isoDateString) {
    if (!isoDateString) return null;
    const date = new Date(isoDateString);
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

router.post('/user/:username/sync', checkIPTVEditorEnabled, async (req, res) => {
    try {
        const { username } = req.params;
        const { user_id } = req.body;
        
        console.log(`🔄 Starting IPTV Editor sync for user: ${username}, user_id: ${user_id}`);
        
        if (!user_id) {
            return res.status(400).json({
                success: false,
                message: 'User ID is required for sync operation'
            });
        }
        
        // Check if user is already linked in local database
        const localUserResult = await db.query(
            'SELECT * FROM iptv_editor_users WHERE user_id = ?',
            [user_id]
        );
        
        if (localUserResult.length > 0) {
            // USER IS ALREADY LINKED - Do force-sync
            console.log('✅ User already linked, performing force-sync...');
            
            const localUser = localUserResult[0];
            
            // Get PinkPony credentials for force-sync
            const panelUserResult = await db.query(
                'SELECT iptv_username, iptv_password FROM users WHERE id = ?',
                [user_id]
            );
            
            if (panelUserResult.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Local user not found'
                });
            }
            
            const panelUser = panelUserResult[0];
            
            // Get settings for API call
            const settings = await iptvEditorService.getAllSettings();
            
            // Prepare force-sync data
            const forceSyncData = {
                playlist: settings.default_playlist_id,
                items: [{
                    id: localUser.iptv_editor_id,
                    username: panelUser.iptv_username,
                    password: panelUser.iptv_password
                }],
                xtream: {
                    url: "https://pinkpony.lol",
                    param1: panelUser.iptv_username,
                    param2: panelUser.iptv_password,
                    type: "xtream"
                }
            };
            
            console.log('📤 Sending force-sync request to IPTV Editor...');
            
            // Call IPTV Editor force-sync API
            const syncStartTime = Date.now();
            const syncResponse = await iptvEditorService.makeRequest('/api/reseller/force-sync', forceSyncData);
            const syncDuration = Date.now() - syncStartTime;
            
            console.log('✅ Force-sync response:', syncResponse);
            
            // Update local database with fresh data
            let newExpiryDate = localUser.expiry_date;
            if (syncResponse.expiry) {
                newExpiryDate = new Date(syncResponse.expiry).toISOString().slice(0, 19).replace('T', ' ');
            }
            
            await db.query(`
                UPDATE iptv_editor_users 
                SET sync_status = 'synced', 
                    last_sync_time = NOW(),
                    max_connections = ?,
                    expiry_date = ?
                WHERE user_id = ?
            `, [
                syncResponse.max_connections || localUser.max_connections,
                newExpiryDate,
                user_id
            ]);
            
            // Log the sync operation
            await db.query(`
                INSERT INTO iptv_sync_logs (sync_type, user_id, status, request_data, response_data, duration_ms)
                VALUES ('force_sync', ?, 'success', ?, ?, ?)
            `, [
                user_id,
                JSON.stringify(forceSyncData),
                JSON.stringify(syncResponse),
                syncDuration
            ]);
            
            console.log(`✅ Force-sync completed successfully in ${syncDuration}ms`);
            
            return res.json({
                success: true,
                message: `User '${username}' force-synced successfully`,
                operation: 'force-sync',
                data: {
                    username: username,
                    iptv_editor_id: localUser.iptv_editor_id,
                    sync_duration_ms: syncDuration,
                    max_connections: syncResponse.max_connections || localUser.max_connections,
                    expiry: syncResponse.expiry,
                    updated: syncResponse.updated || false
                }
            });
            
        } else {
            // USER IS NOT LINKED - Do discovery/link
            console.log('🔍 User not linked, searching IPTV Editor for linking...');
            
            // Get settings for API call
            const settings = await iptvEditorService.getAllSettings();
            
            if (!settings.bearer_token || !settings.default_playlist_id) {
                return res.status(400).json({
                    success: false,
                    message: 'IPTV Editor is not properly configured'
                });
            }
            
            // Get all users from IPTV Editor API
            const apiUsers = await iptvEditorService.getAllUsers();
            
            // Find user by username
            const foundUser = apiUsers.find(item => 
                item.username && item.username.toLowerCase() === username.toLowerCase()
            );
            
            if (!foundUser) {
                return res.status(404).json({
                    success: false,
                    message: `User "${username}" not found in IPTV Editor`
                });
            }
            
            console.log('✅ Found user in IPTV Editor, linking...', foundUser.username);
            
            // Convert expiry timestamp to MySQL format
            let expiryDate = null;
            if (foundUser.expiry) {
                expiryDate = new Date(foundUser.expiry).toISOString().slice(0, 19).replace('T', ' ');
            }
            
            // Save the link to local database
            await db.query(`
                INSERT INTO iptv_editor_users (
                    user_id, iptv_editor_id, iptv_editor_username, iptv_editor_password,
                    m3u_code, epg_code, expiry_date, max_connections, sync_status, last_sync_time
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'synced', NOW())
            `, [
                user_id,
                foundUser.id,
                foundUser.username,
                foundUser.password,
                foundUser.m3u || '',
                foundUser.epg || '',
                expiryDate,
                foundUser.max_connections || 1
            ]);
            
            // Update main users table
            await db.query(
                'UPDATE users SET iptv_editor_enabled = TRUE WHERE id = ?',
                [user_id]
            );
            
            // Log the link operation
            await db.query(`
                INSERT INTO iptv_sync_logs (sync_type, user_id, status, request_data, response_data)
                VALUES ('user_link', ?, 'success', ?, ?)
            `, [
                user_id,
                JSON.stringify({ username, search_type: 'discovery' }),
                JSON.stringify(foundUser)
            ]);
            
            console.log('✅ User linked successfully');
            
            return res.json({
                success: true,
                message: `User '${username}' found and linked successfully`,
                operation: 'link',
                user: {
                    username: foundUser.username,
                    iptv_editor_id: foundUser.id,
                    m3u_code: foundUser.m3u,
                    epg_code: foundUser.epg,
                    m3u_url: foundUser.m3u ? `https://editor.iptveditor.com/m3u/${foundUser.m3u}` : null,
                    epg_url: foundUser.epg ? `https://editor.iptveditor.com/epg/${foundUser.epg}` : null,
                    expiry_date: foundUser.expiry,
                    max_connections: foundUser.max_connections,
                    last_updated: new Date().toLocaleDateString()
                }
            });
        }
        
    } catch (error) {
        console.error('❌ IPTV Editor sync/link failed:', error);
        
        // Log the failed operation
        try {
            const { user_id } = req.body;
            if (user_id) {
                await db.query(`
                    INSERT INTO iptv_sync_logs (sync_type, user_id, status, error_message)
                    VALUES ('sync_or_link', ?, 'error', ?)
                `, [user_id, error.message]);
            }
        } catch (logError) {
            console.warn('⚠️ Failed to log sync error:', logError.message);
        }
        
        res.status(500).json({
            success: false,
            message: 'Failed to sync/link IPTV Editor user',
            error: error.message
        });
    }
});

// Delete IPTV Editor user - ADD THIS ROUTE
router.delete('/user/:username', checkIPTVEditorEnabled, async (req, res) => {
    try {
        const { username } = req.params;
        const { user_id } = req.body;
        
        console.log(`🗑️ Deleting IPTV Editor user: ${username} for local user ${user_id}`);
        
        if (!user_id) {
            return res.status(400).json({
                success: false,
                message: 'User ID is required for deletion'
            });
        }
        
        // Get user data from local database
        const localRecord = await db.query(
            'SELECT * FROM iptv_editor_users WHERE user_id = ? AND iptv_editor_username = ?',
            [user_id, username]
        );
        
        if (localRecord.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'IPTV Editor user not found in local database'
            });
        }
        
        const iptvUser = localRecord[0];
        
        // Delete from IPTV Editor service
        try {
            const deleteData = {
                id: iptvUser.iptv_editor_id
            };
            
            const deleteResponse = await iptvEditorService.makeRequest('/api/reseller/remove', deleteData);
            console.log('✅ IPTV Editor deletion response:', deleteResponse);
        } catch (deleteError) {
            console.warn('⚠️ Warning: Failed to delete from IPTV Editor service:', deleteError.message);
            // Continue with local deletion even if remote deletion fails
        }
        
        // Delete from local database
        await db.query('DELETE FROM iptv_editor_users WHERE user_id = ?', [user_id]);
        
        // Update main users table
        await db.query('UPDATE users SET iptv_editor_enabled = FALSE WHERE id = ?', [user_id]);
        
        console.log(`✅ IPTV Editor user deleted successfully for local user ${user_id}`);
        
        res.json({
            success: true,
            message: `IPTV Editor user '${username}' deleted successfully`
        });
        
    } catch (error) {
        console.error('❌ Error deleting IPTV Editor user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete IPTV Editor user',
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

// Check if user exists in IPTV Editor by username
router.post('/check-user', async (req, res) => {
    try {
        const { username } = req.body;
        
        if (!username) {
            return res.status(400).json({
                success: false,
                message: 'Username is required'
            });
        }
        
        console.log('🔍 Checking IPTV Editor for username:', username);
        
        // Get settings for API call
        const settings = await iptvEditorService.getAllSettings();
        
        if (!settings.bearer_token || !settings.default_playlist_id) {
            return res.status(400).json({
                success: false,
                message: 'IPTV Editor is not properly configured'
            });
        }
        
        // Get all users from IPTV Editor API  
        const apiUsers = await iptvEditorService.getAllUsers();
        
        // Look for user by username
        const user = apiUsers.find(item => 
            item.username && item.username.toLowerCase() === username.toLowerCase()
        );
        
        if (user) {
            console.log('✅ Found user in IPTV Editor:', user.username);
            return res.json({
                success: true,
                exists: true,
                user: user,
                message: 'User found in IPTV Editor'
            });
        } else {
            console.log('❌ User not found in IPTV Editor');
            return res.json({
                success: true,
                exists: false,
                user: null,
                message: 'User not found in IPTV Editor'
            });
        }
        
    } catch (error) {
        console.error('❌ Error checking IPTV Editor user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check IPTV Editor user: ' + error.message
        });
    }
});

// Link existing IPTV Editor user to local user  
router.post('/link-user', [
    body('user_id').isInt({ min: 1 }).withMessage('User ID must be a positive integer'),
    body('iptv_editor_user_id').notEmpty().withMessage('IPTV Editor user ID is required'),
    body('iptv_editor_username').isString().notEmpty().withMessage('IPTV Editor username is required'),
    handleValidationErrors
], async (req, res) => {
    try {
        const { user_id, iptv_editor_user_id, iptv_editor_username } = req.body;
        
        console.log('🔗 Linking IPTV Editor user to local user:', { user_id, iptv_editor_username });
        
        // Update user record with IPTV Editor information
        await db.execute(`
            UPDATE users 
            SET iptv_editor_user_id = ?, 
                iptv_editor_username = ?,
                iptv_editor_enabled = true,
                updated_at = NOW()
            WHERE id = ?
        `, [iptv_editor_user_id, iptv_editor_username, user_id]);
        
        res.json({
            success: true,
            message: 'IPTV Editor user linked successfully'
        });
        
    } catch (error) {
        console.error('❌ Error linking IPTV Editor user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to link IPTV Editor user: ' + error.message
        });
    }
});

// Create new IPTV Editor user
// Create new IPTV Editor user (corrected structure)
router.post('/create-user', [
    body('user_id').isInt({ min: 1 }).withMessage('User ID must be a positive integer'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('iptv_username').isString().notEmpty().withMessage('IPTV username is required'),
    body('iptv_password').isString().notEmpty().withMessage('IPTV password is required'),
    body('max_connections').optional().isInt({ min: 1, max: 10 }).withMessage('Max connections must be between 1 and 10'),
    body('expiry_days').optional().isInt({ min: 1 }).withMessage('Expiry days must be positive'),
    handleValidationErrors
], async (req, res) => {
    try {
        const { user_id, email, iptv_username, iptv_password, max_connections = 2, expiry_days = 30 } = req.body;
        
        console.log('👤 Creating new IPTV Editor user for:', { email, iptv_username });
        
        // Get settings
        const settings = await iptvEditorService.getAllSettings();
        
        if (!settings.default_playlist_id) {
            return res.status(400).json({
                success: false,
                message: 'Default playlist not configured'
            });
        }
        
        // Get all active channel categories
        const categoriesResult = await db.execute(`
            SELECT category_id FROM iptv_editor_categories 
            WHERE type = 'channels' AND is_active = true
        `);
        
        const channelCategories = categoriesResult[0].map(cat => cat.category_id);
        
        if (channelCategories.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No channel categories found. Please sync categories first.'
            });
        }
        
        // Get VOD categories (default to [73] if none found)
        const vodCategoriesResult = await db.execute(`
            SELECT category_id FROM iptv_editor_categories 
            WHERE type = 'vods' AND is_active = true
        `);
        
        const vodCategories = vodCategoriesResult[0].length > 0 ? 
            vodCategoriesResult[0].map(cat => cat.category_id) : [73];
        
        // Calculate expiry date
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + expiry_days);
        
        // Create the proper request structure
        const requestData = {
            playlist: settings.default_playlist_id,
            items: {
                name: email, // Use email as name
                note: `Created for user ID ${user_id}`,
                username: iptv_username, // IPTV panel username
                password: iptv_password, // IPTV panel password
                message: null,
                channels_categories: channelCategories,
                vods_categories: vodCategories,
                series_categories: [],
                patterns: [{
                    url: "https://pinkpony.lol",
                    param1: iptv_username, // Same IPTV username
                    param2: iptv_password, // Same IPTV password
                    type: "xtream"
                }],
                language: "en",
                expiry: expiryDate.toISOString()
            }
        };
        
        console.log('📤 Creating IPTV Editor user with structure:', {
            playlist: requestData.playlist,
            name: requestData.items.name,
            username: requestData.items.username,
            channelCount: channelCategories.length,
            expiry: requestData.items.expiry
        });
        
        // Make API call to IPTV Editor
        const response = await fetch('https://editor.iptveditor.com/api/reseller/new-customer', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.bearer_token}`,
                'Origin': 'https://cloud.iptveditor.com'
            },
            body: JSON.stringify(requestData)
        });
        
        const result = await response.json();
        
        if (response.ok && result.customer) {
            // Update local user record
            await db.execute(`
                UPDATE users 
                SET iptv_editor_user_id = ?, 
                    iptv_editor_username = ?,
                    iptv_editor_enabled = true,
                    updated_at = NOW()
                WHERE id = ?
            `, [result.customer.id, iptv_username, user_id]);
            
            console.log('✅ IPTV Editor user created successfully:', result.customer.id);
            
            res.json({
                success: true,
                message: 'IPTV Editor account created successfully',
                user: {
                    iptv_editor_id: response.customer.id,
                    iptv_editor_username: iptvEditorUsername, // The IPTV Editor username (manually entered)
                    iptv_panel_username: iptvPanelUsername, // The IPTV panel username (used in param1)
                    m3u_code: response.customer.m3u,
                    epg_code: response.customer.epg,
                    m3u_url: response.customer.m3u ? `https://editor.iptveditor.com/m3u/${response.customer.m3u}` : null,
                    epg_url: response.customer.epg ? `https://editor.iptveditor.com/epg/${response.customer.epg}` : null,
                    expiry_date: response.customer.expiry,
                    max_connections: response.customer.max_connections || 1
                }
            });
        } else {
            throw new Error(result.message || 'Failed to create user in IPTV Editor');
        }
        
    } catch (error) {
        console.error('❌ Error creating IPTV Editor user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create IPTV Editor user: ' + error.message
        });
    }
});

// Sync categories from IPTV Editor
// Sync categories from IPTV Editor
router.post('/sync-categories', async (req, res) => {
    try {
        console.log('🔄 Syncing IPTV Editor categories...');
        
        // Get settings
        const settings = await iptvEditorService.getAllSettings();
        
        if (!settings.bearer_token || !settings.default_playlist_id) {
            return res.status(400).json({
                success: false,
                message: 'IPTV Editor is not properly configured'
            });
        }
        
        // Make API call to get categories
        const response = await fetch('https://editor.iptveditor.com/api/reseller/get-all-categories', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.bearer_token}`,
                'Origin': 'https://cloud.iptveditor.com'
            },
            body: JSON.stringify({
                playlist: settings.default_playlist_id
            })
        });
        
        if (!response.ok) {
            throw new Error(`API call failed: ${response.status} ${response.statusText}`);
        }
        
        const categories = await response.json();
        
        console.log('📺 Received categories:', {
            channels: categories.channels?.length || 0,
            vods: categories.vods?.length || 0,
            series: categories.series?.length || 0
        });
        
        // Sync channel categories
        if (categories.channels && categories.channels.length > 0) {
// Clear existing categories
await db.query('DELETE FROM iptv_editor_categories WHERE type = ?', ['channels']);

// Insert new categories
for (const category of categories.channels) {
    await db.query(`
        INSERT INTO iptv_editor_categories (category_id, name, type, is_active)
        VALUES (?, ?, 'channels', true)
    `, [category.value, category.text]);
}
            
            console.log(`✅ Synced ${categories.channels.length} channel categories`);
        }
        
        // Sync VOD categories
        if (categories.vods && categories.vods.length > 0) {
// Clear existing VOD categories
await db.query('DELETE FROM iptv_editor_categories WHERE type = ?', ['vods']);

// Insert new VOD categories
for (const category of categories.vods) {
    await db.query(`
        INSERT INTO iptv_editor_categories (category_id, name, type, is_active)
        VALUES (?, ?, 'vods', true)
    `, [category.value, category.text]);
}
            
            console.log(`✅ Synced ${categories.vods.length} VOD categories`);
        }
        
        // Sync series categories
        if (categories.series && categories.series.length > 0) {
// Clear existing series categories
await db.query('DELETE FROM iptv_editor_categories WHERE type = ?', ['series']);

// Insert new series categories
for (const category of categories.series) {
    await db.query(`
        INSERT INTO iptv_editor_categories (category_id, name, type, is_active)
        VALUES (?, ?, 'series', true)
    `, [category.value, category.text]);
}
            
            console.log(`✅ Synced ${categories.series.length} series categories`);
        }
        
        res.json({ 
            success: true, 
            message: 'Categories synced successfully',
            data: {
                channels_synced: categories.channels?.length || 0,
                vods_synced: categories.vods?.length || 0,
                series_synced: categories.series?.length || 0
            }
        });
        
    } catch (error) {
        console.error('❌ Error syncing categories:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to sync categories',
            error: error.message
        });
    }
});

// Get stored categories
router.get('/categories', async (req, res) => {
    try {
        console.log('📺 Loading stored IPTV Editor categories...');
        
const categories = await db.query(`
    SELECT category_id, name, type, is_active 
    FROM iptv_editor_categories 
    WHERE is_active = true 
    ORDER BY type, name
`);
        
const result = {
    channels: categories.filter(cat => cat.type === 'channels'),
    vods: categories.filter(cat => cat.type === 'vods'),
    series: categories.filter(cat => cat.type === 'series')
};
        
        res.json({ 
            success: true, 
            data: result,
            message: 'Categories loaded successfully'
        });
        
    } catch (error) {
        console.error('❌ Error getting stored categories:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get stored categories',
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

// Auto-updater route - needs token handling  
router.post('/run-auto-updater', checkIPTVEditorEnabled, async (req, res) => {
    try {
        console.log('🚀 Starting IPTV Editor Auto-Updater');
        
        // Get playlist ID and settings
        const settings = await iptvEditorService.getAllSettings();
        const playlistId = settings.default_playlist_id;
        
        if (!playlistId) {
            return res.status(400).json({
                success: false,
                message: 'No default playlist selected'
            });
        }

        // STEP 1: Get updater config first (this returns the fresh token)
        const configResponse = await iptvEditorService.getAutoUpdaterConfig(playlistId);
        
        // STEP 2: Extract the fresh token from response
        const freshToken = configResponse.token; // This is the key!
        
        if (!freshToken) {
            return res.status(400).json({
                success: false,
                message: 'Failed to get auto-updater token'
            });
        }

        console.log('✅ Got fresh auto-updater token');

        // STEP 3: Collect provider data using settings
        const providerData = await iptvEditorService.collectProviderData(
            settings.provider_base_url,
            settings.provider_username,
            settings.provider_password
        );
        
        // STEP 4: Prepare FormData for submission
        const FormData = require('form-data');
        const formData = new FormData();
        formData.append('url', settings.provider_base_url);
        formData.append('info', providerData[0]);                  // Basic info
        formData.append('get_live_streams', providerData[1]);      // Live streams
        formData.append('get_live_categories', providerData[2]);   // Live categories  
        formData.append('get_vod_streams', providerData[3]);       // VOD streams
        formData.append('get_vod_categories', providerData[4]);    // VOD categories
        formData.append('get_series', providerData[5]);            // Series
        formData.append('get_series_categories', providerData[6]); // Series categories
        formData.append('m3u', providerData[7]);                   // M3U playlist

        // STEP 5: Submit with the FRESH token (not original bearer token)
        const axios = require('axios');
        const submitResponse = await axios.post(
            'https://editor.iptveditor.com/api/auto-updater/run-auto-updater',
            formData,
            {
                headers: {
                    ...formData.getHeaders(),
                    'Authorization': `Bearer ${freshToken}`, // Use fresh token here!
                    'Origin': 'https://cloud.iptveditor.com'
                },
                timeout: 600000 // 10 minutes
            }
        );

        console.log('✅ Auto-updater submission successful');
        
        // STEP 6: Reload playlist to get updated stats (using makeAPICall now that it exists)
        try {
            await iptvEditorService.makeAPICall('/api/playlist/reload-playlist', {
                playlist: playlistId
            });
        } catch (reloadError) {
            console.warn('⚠️ Playlist reload failed (non-critical):', reloadError.message);
        }

        res.json({
            success: true,
            message: 'Auto-updater completed successfully',
            data: submitResponse.data
        });

    } catch (error) {
        console.error('❌ Auto-updater failed:', error);
        res.status(500).json({
            success: false,
            message: 'Auto-updater failed: ' + error.message
        });
    }
});

// Debug endpoint - add this temporarily
router.post('/debug-formdata', async (req, res) => {
    try {
        console.log('🔍 DEBUG: Inspecting FormData generation...');
        
        // Get settings and collect small amount of data
        const settings = await iptvEditorService.getAllSettings();
        
        // Use small test datasets instead of full 80MB
        const testDatasets = [
            '{"user_info":{"username":"johnsonflixiptv","password":"08108672","auth":1}}', // info
            '[{"test":"live_streams"}]', // live_streams
            '[{"test":"live_categories"}]', // live_categories  
            '[{"test":"vod_streams"}]', // vod_streams
            '[{"test":"vod_categories"}]', // vod_categories
            '[{"test":"series"}]', // series
            '[{"test":"series_categories"}]', // series_categories
            '#EXTM3U\n#EXTINF:-1,Test\nhttp://test.com' // m3u
        ];
        
        // Debug our FormData structure
        const debugInfo = await iptvEditorService.debugFormData(
            settings.provider_base_url || 'https://pinkpony.lol',
            testDatasets
        );
        
        res.json({
            success: true,
            message: 'FormData debug completed',
            debug: debugInfo
        });
        
    } catch (error) {
        console.error('❌ FormData debug failed:', error);
        res.status(500).json({
            success: false,
            message: 'FormData debug failed',
            error: error.message
        });
    }
});

// Debug endpoint - add this temporarily
router.get('/debug/settings', async (req, res) => {
    try {
        const settings = await iptvEditorService.getAllSettings();
        const playlists = await iptvEditorService.getStoredPlaylists();
        
        res.json({
            settings: settings,
            playlists: playlists
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;