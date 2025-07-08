// routes-iptv.js - IPTV API Routes - FIXED VERSION
const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const db = require('./database-config');
const iptvService = require('./iptv-service');

// Helper function to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false, 
      message: 'Validation errors', 
      errors: errors.array() 
    });
  }
  next();
};

// Initialize IPTV service on startup
iptvService.initialize().catch(console.error);

/**
 * GET /api/iptv/packages - Get available IPTV packages
 */
router.get('/packages', async (req, res) => {
  try {
    const packages = await iptvService.getAvailablePackages();
    
    // Ensure packages is an array before filtering
    if (!Array.isArray(packages)) {
      console.error('❌ Packages is not an array:', typeof packages);
      return res.json({
        success: true,
        packages: {
          trial: [],
          full: [],
          live_tv: [],
          basic: []
        },
        total: 0
      });
    }
    
    // Group packages by type for easier frontend handling
    const groupedPackages = {
      trial: packages.filter(p => p.package_type === 'trial'),
      full: packages.filter(p => p.package_type === 'full'),
      live_tv: packages.filter(p => p.package_type === 'live_tv'),
      basic: packages.filter(p => p.package_type === 'basic')
    };
    
    res.json({
      success: true,
      packages: groupedPackages,
      total: packages.length
    });
  } catch (error) {
    console.error('❌ Error getting packages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get packages',
      error: error.message
    });
  }
});

/**
 * POST /api/iptv/sync-packages - Force sync packages from panel
 */
router.post('/sync-packages', async (req, res) => {
  try {
    await iptvService.initialize();
    const count = await iptvService.syncPackagesFromPanel();
    
    res.json({
      success: true,
      message: `Successfully synced ${count} packages from panel`,
      count: count
    });
  } catch (error) {
    console.error('❌ Error syncing packages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync packages',
      error: error.message
    });
  }
});

/**
 * GET /api/iptv/bouquets - Get all bouquets - FIXED VERSION
 */
router.get('/bouquets', async (req, res) => {
  try {
    console.log('🔍 Getting bouquets from database...');
    
    const result = await db.query(`
      SELECT bouquet_id, name, category, is_active, synced_at 
      FROM iptv_bouquets 
      WHERE is_active = true 
      ORDER BY category, name
    `);
    
    console.log('🔍 Database result type:', typeof result);
    console.log('🔍 Database result length:', Array.isArray(result) ? result.length : 'not array');
    
    // Handle different return formats from mysql2
    let rows;
    if (Array.isArray(result)) {
      rows = result;
    } else if (result && Array.isArray(result[0])) {
      rows = result[0];
    } else {
      console.log('🔍 Unexpected result format:', result);
      rows = [];
    }
    
    console.log('🔍 Final rows count:', rows.length);
    
    if (!rows || rows.length === 0) {
      return res.json({
        success: true,
        bouquets: {},
        total: 0,
        message: 'No bouquets found in database'
      });
    }
    
    // Group by category
    const groupedBouquets = {};
    rows.forEach(bouquet => {
      const category = bouquet.category || 'General';
      if (!groupedBouquets[category]) {
        groupedBouquets[category] = [];
      }
      groupedBouquets[category].push({
        id: bouquet.bouquet_id,
        name: bouquet.name,
        category: bouquet.category,
        synced_at: bouquet.synced_at
      });
    });
    
    console.log('✅ Returning', rows.length, 'bouquets in', Object.keys(groupedBouquets).length, 'categories');
    
    res.json({
      success: true,
      bouquets: groupedBouquets,
      total: rows.length
    });
  } catch (error) {
    console.error('❌ Error getting bouquets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get bouquets',
      error: error.message
    });
  }
});

/**
 * POST /api/iptv/sync-bouquets - Force sync bouquets from panel
 */
router.post('/sync-bouquets', async (req, res) => {
  try {
    await iptvService.initialize();
    const count = await iptvService.syncBouquetsFromPanel();
    
    res.json({
      success: true,
      message: `Successfully synced ${count} bouquets from panel`,
      count: count
    });
  } catch (error) {
    console.error('❌ Error syncing bouquets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync bouquets',
      error: error.message
    });
  }
});

/**
 * GET /api/iptv/channel-groups - Get custom channel groups
 */
router.get('/channel-groups', async (req, res) => {
  try {
    const groups = await iptvService.getChannelGroups();
    
    // Ensure groups is an array before mapping
    if (!Array.isArray(groups)) {
      console.error('❌ Channel groups is not an array:', typeof groups);
      return res.json({
        success: true,
        channelGroups: [],
        total: 0
      });
    }
    
    // Parse bouquet_ids JSON for each group
    const parsedGroups = groups.map(group => ({
      ...group,
      bouquet_ids: typeof group.bouquet_ids === 'string' 
        ? JSON.parse(group.bouquet_ids) 
        : group.bouquet_ids
    }));
    
    res.json({
      success: true,
      channelGroups: parsedGroups,
      total: parsedGroups.length
    });
  } catch (error) {
    console.error('❌ Error getting channel groups:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get channel groups',
      error: error.message
    });
  }
});

/**
 * POST /api/iptv/channel-groups - Create new channel group
 */
router.post('/channel-groups', [
  body('name').notEmpty().withMessage('Name is required'),
  body('bouquet_ids').isArray().withMessage('Bouquet IDs must be an array'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { name, description, bouquet_ids } = req.body;
    
    const groupId = await iptvService.createChannelGroup(name, description || '', bouquet_ids);
    
    res.json({
      success: true,
      message: 'Channel group created successfully',
      groupId: groupId
    });
  } catch (error) {
    console.error('❌ Error creating channel group:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create channel group',
      error: error.message
    });
  }
});

/**
 * PUT /api/iptv/channel-groups/:id - Update channel group
 */
router.put('/channel-groups/:id', [
  param('id').isInt().withMessage('Invalid group ID'),
  body('name').notEmpty().withMessage('Name is required'),
  body('bouquet_ids').isArray().withMessage('Bouquet IDs must be an array'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, bouquet_ids } = req.body;
    
    await iptvService.updateChannelGroup(id, name, description || '', bouquet_ids);
    
    res.json({
      success: true,
      message: 'Channel group updated successfully'
    });
  } catch (error) {
    console.error('❌ Error updating channel group:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update channel group',
      error: error.message
    });
  }
});

/**
 * DELETE /api/iptv/channel-groups/:id - Delete channel group
 */
router.delete('/channel-groups/:id', [
  param('id').isInt().withMessage('Invalid group ID'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    
    await iptvService.deleteChannelGroup(id);
    
    res.json({
      success: true,
      message: 'Channel group deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting channel group:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete channel group',
      error: error.message
    });
  }
});

/**
 * GET /api/iptv/user/:id - Get user's IPTV status
 */
router.get('/user/:id', [
  param('id').isInt().withMessage('Invalid user ID'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get user's IPTV data from database
    const result = await db.query(`
      SELECT 
        u.id, u.name, u.email, u.iptv_username, u.iptv_line_id,
        u.iptv_package_id, u.iptv_package_name, u.iptv_expiration,
        u.iptv_credits_used, u.iptv_channel_group_id, u.iptv_connections,
        u.iptv_is_trial, u.implayer_code,
        cg.name as channel_group_name,
        cg.description as channel_group_description
      FROM users u
      LEFT JOIN iptv_channel_groups cg ON u.iptv_channel_group_id = cg.id
      WHERE u.id = ?
    `, [id]);
    
    // Handle different return formats from mysql2
    const rows = Array.isArray(result) ? result[0] : result;
    
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const user = rows[0];
    
    // Calculate status
    let status = 'inactive';
    if (user.iptv_expiration) {
      const now = new Date();
      const expiration = new Date(user.iptv_expiration);
      status = expiration > now ? 'active' : 'expired';
    }
    
    res.json({
      success: true,
      user: {
        ...user,
        status: status,
        expiration_formatted: user.iptv_expiration 
          ? new Date(user.iptv_expiration).toLocaleDateString() 
          : null
      }
    });
  } catch (error) {
    console.error('❌ Error getting user IPTV status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user IPTV status',
      error: error.message
    });
  }
});

/**
 * POST /api/iptv/subscription - Create or extend IPTV subscription
 */
router.post('/subscription', [
  body('user_id').isInt().withMessage('Invalid user ID'),
  body('package_id').notEmpty().withMessage('Package ID is required'),
  body('channel_group_id').isInt().withMessage('Channel group ID is required'),
  body('action').isIn(['create_trial', 'create_paid', 'extend']).withMessage('Invalid action'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { user_id, package_id, channel_group_id, action, username, password } = req.body;
    
    await iptvService.initialize();
    
    // Get user data
    const userResult = await db.query('SELECT * FROM users WHERE id = ?', [user_id]);
    const userRows = Array.isArray(userResult) ? userResult[0] : userResult;
    
    if (!userRows || !Array.isArray(userRows) || userRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const user = userRows[0];
    
    // Get package info
    const packageInfo = await iptvService.getPackageInfo(package_id);
    if (!packageInfo) {
      return res.status(400).json({
        success: false,
        message: 'Invalid package selected'
      });
    }
    
    // Get channel group bouquets
    const channelGroupResult = await db.query(
      'SELECT bouquet_ids FROM iptv_channel_groups WHERE id = ? AND is_active = true',
      [channel_group_id]
    );
    
    const channelGroupRows = Array.isArray(channelGroupResult) ? channelGroupResult[0] : channelGroupResult;
    
    if (!channelGroupRows || !Array.isArray(channelGroupRows) || channelGroupRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid channel group selected'
      });
    }
    
    const bouquetIds = JSON.parse(channelGroupRows[0].bouquet_ids);
    
    // Check credit balance for paid subscriptions
    if (action !== 'create_trial') {
      const currentBalance = await iptvService.getLocalCreditBalance();
      if (currentBalance < packageInfo.credits) {
        return res.status(400).json({
          success: false,
          message: `Insufficient credits. Required: ${packageInfo.credits}, Available: ${currentBalance}`
        });
      }
    }
    
    let apiResponse;
    let finalUsername = username;
    let finalPassword = password;
    let isExtending = false;
    
    // Execute the appropriate action
    switch (action) {
      case 'create_trial':
        if (!username) {
          return res.status(400).json({
            success: false,
            message: 'Username is required for trial creation'
          });
        }
        apiResponse = await iptvService.createTrialUser(username, password, package_id, bouquetIds);
        break;
        
      case 'create_paid':
        if (!username) {
          return res.status(400).json({
            success: false,
            message: 'Username is required for paid subscription creation'
          });
        }
        apiResponse = await iptvService.createPaidUser(username, password, package_id, bouquetIds);
        break;
        
      case 'extend':
        if (!user.iptv_line_id) {
          return res.status(400).json({
            success: false,
            message: 'No existing IPTV subscription to extend'
          });
        }
        apiResponse = await iptvService.extendUser(user.iptv_line_id, package_id, bouquetIds);
        finalUsername = user.iptv_username;
        finalPassword = user.iptv_password;
        isExtending = true;
        break;
    }
    
    // Extract response data (API response format may vary)
    let lineId = apiResponse.id || apiResponse.line_id || user.iptv_line_id;
    if (apiResponse.user && apiResponse.user.id) {
      lineId = apiResponse.user.id;
    }
    
    // If password was auto-generated, extract it from response
    if (!finalPassword && apiResponse.password) {
      finalPassword = apiResponse.password;
    } else if (!finalPassword && apiResponse.user && apiResponse.user.password) {
      finalPassword = apiResponse.user.password;
    }
    
    // Calculate expiration date
    const expirationDate = iptvService.calculateExpirationDate(
      packageInfo, 
      isExtending, 
      user.iptv_expiration
    );
    
    // Generate iMPlayer code
    const implayerCode = iptvService.generateiMPlayerCode(finalUsername, finalPassword);
    
    // Update user record in database
    const creditsUsed = action === 'create_trial' ? 0 : packageInfo.credits;
    
    await db.query(`
      UPDATE users SET 
        iptv_username = ?,
        iptv_password = ?,
        iptv_line_id = ?,
        iptv_package_id = ?,
        iptv_package_name = ?,
        iptv_expiration = ?,
        iptv_credits_used = iptv_credits_used + ?,
        iptv_channel_group_id = ?,
        iptv_connections = ?,
        iptv_is_trial = ?,
        implayer_code = ?,
        updated_at = NOW()
      WHERE id = ?
    `, [
      finalUsername,
      finalPassword,
      lineId,
      package_id,
      packageInfo.name,
      expirationDate,
      creditsUsed,
      channel_group_id,
      packageInfo.connections,
      action === 'create_trial',
      implayerCode,
      user_id
    ]);
    
    // Log the activity
    await iptvService.logActivity(
      user_id, 
      lineId, 
      action, 
      package_id, 
      creditsUsed, 
      true, 
      null, 
      apiResponse
    );
    
    // Return success response with all details
    res.json({
      success: true,
      message: `IPTV subscription ${action.replace('_', ' ')} successful`,
      subscription: {
        username: finalUsername,
        password: finalPassword,
        line_id: lineId,
        package_name: packageInfo.name,
        connections: packageInfo.connections,
        expiration: expirationDate,
        expiration_formatted: expirationDate.toLocaleDateString(),
        is_trial: action === 'create_trial',
        credits_used: creditsUsed,
        implayer_code: implayerCode,
        stream_urls: {
          m3u: `https://Pinkpony.lol:443/get.php?username=${finalUsername}&password=${finalPassword}&type=m3u&output=ts`,
          m3u_plus: `https://Pinkpony.lol:443/get.php?username=${finalUsername}&password=${finalPassword}&type=m3u_plus&output=ts`
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error creating/extending IPTV subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create/extend IPTV subscription',
      error: error.message
    });
  }
});

/**
 * GET /api/iptv/sync-user/:id - Sync single user from panel
 */
router.get('/sync-user/:id', [
  param('id').isInt().withMessage('Invalid user ID'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get user's line_id from database
    const userResult = await db.query(
      'SELECT iptv_line_id, iptv_username FROM users WHERE id = ?',
      [id]
    );
    
    const userRows = Array.isArray(userResult) ? userResult[0] : userResult;
    
    if (!userRows || !Array.isArray(userRows) || userRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const user = userRows[0];
    
    if (!user.iptv_line_id) {
      return res.status(400).json({
        success: false,
        message: 'User has no IPTV subscription to sync'
      });
    }
    
    await iptvService.initialize();
    
    // Get user data from panel
    const panelUser = await iptvService.getUserFromPanel(user.iptv_line_id);
    
    if (!panelUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found in IPTV panel'
      });
    }
    
    // Update local database with panel data
    const expirationDate = panelUser.expire_date 
      ? new Date(panelUser.expire_date * 1000) // Convert Unix timestamp
      : null;
    
    await db.query(`
      UPDATE users SET 
        iptv_expiration = ?,
        iptv_connections = ?,
        iptv_is_trial = ?,
        updated_at = NOW()
      WHERE id = ?
    `, [
      expirationDate,
      panelUser.user_connection || panelUser.connections,
      panelUser.is_trial || 0,
      id
    ]);
    
    // Log the sync
    await iptvService.logActivity(id, user.iptv_line_id, 'sync', null, 0, true, null, panelUser);
    
    res.json({
      success: true,
      message: 'User IPTV data synced successfully',
      panel_data: {
        expiration: expirationDate ? expirationDate.toLocaleDateString() : 'None',
        connections: panelUser.user_connection || panelUser.connections,
        is_trial: Boolean(panelUser.is_trial),
        enabled: Boolean(panelUser.enabled),
        active_connections: panelUser.active_connections || 0
      }
    });
    
  } catch (error) {
    console.error('❌ Error syncing user from panel:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync user from panel',
      error: error.message
    });
  }
});

/**
 * GET /api/iptv/credits - Get current credit balance
 */
router.get('/credits', async (req, res) => {
  try {
    const localBalance = await iptvService.getLocalCreditBalance();
    
    res.json({
      success: true,
      credits: localBalance,
      last_updated: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error getting credit balance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get credit balance',
      error: error.message
    });
  }
});

/**
 * POST /api/iptv/sync-credits - Force sync credits from panel
 */
router.post('/sync-credits', async (req, res) => {
  try {
    await iptvService.initialize();
    const balance = await iptvService.syncCreditBalance();
    
    res.json({
      success: true,
      message: 'Credit balance synced successfully',
      credits: balance
    });
  } catch (error) {
    console.error('❌ Error syncing credits:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync credit balance',
      error: error.message
    });
  }
});

/**
 * POST /api/iptv/test-connection - Test IPTV panel connection
 */
router.post('/test-connection', async (req, res) => {
  try {
    const result = await iptvService.testConnection();
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('❌ Error testing IPTV connection:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test connection',
      error: error.message
    });
  }
});

/**
 * GET /api/iptv/activity/:userId - Get IPTV activity log for user
 */
router.get('/activity/:userId', [
  param('userId').isInt().withMessage('Invalid user ID'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    
    const result = await db.query(`
      SELECT 
        action, package_id, credits_used, success, error_message, created_at,
        line_id
      FROM iptv_activity_log 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `, [userId, limit, offset]);
    
    // Handle different return formats from mysql2
    const rows = Array.isArray(result) ? result[0] : result;
    
    res.json({
      success: true,
      activities: Array.isArray(rows) ? rows : [],
      total: Array.isArray(rows) ? rows.length : 0
    });
  } catch (error) {
    console.error('❌ Error getting IPTV activity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get IPTV activity',
      error: error.message
    });
  }
});

/**
 * DELETE /api/iptv/user/:id - Remove IPTV subscription (database only)
 * Note: This doesn't delete from panel, only clears local database
 */
router.delete('/user/:id', [
  param('id').isInt().withMessage('Invalid user ID'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    
    // Clear IPTV data from user record
    await db.query(`
      UPDATE users SET 
        iptv_username = NULL,
        iptv_password = NULL,
        iptv_line_id = NULL,
        iptv_package_id = NULL,
        iptv_package_name = NULL,
        iptv_expiration = NULL,
        iptv_channel_group_id = NULL,
        iptv_connections = NULL,
        iptv_is_trial = FALSE,
        implayer_code = NULL,
        updated_at = NOW()
      WHERE id = ?
    `, [id]);
    
    res.json({
      success: true,
      message: 'IPTV subscription data cleared from database'
    });
  } catch (error) {
    console.error('❌ Error removing IPTV subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove IPTV subscription',
      error: error.message
    });
  }
});

module.exports = router;