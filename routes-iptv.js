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
 * GET /api/iptv/packages - Get available IPTV packages (enhanced with breakdown)
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
          basic: [],
          full: [],
          live_tv: []
        },
        total: 0,
        breakdown: { trial: 0, basic: 0, full: 0, live_tv: 0 }
      });
    }
    
    // Group packages by type for easier frontend handling
    const groupedPackages = {
      trial: packages.filter(p => p.package_type === 'trial'),
      basic: packages.filter(p => p.package_type === 'basic'),
      full: packages.filter(p => p.package_type === 'full'),
      live_tv: packages.filter(p => p.package_type === 'live_tv')
    };
    
    // Create breakdown object
    const breakdown = {
      trial: groupedPackages.trial.length,
      basic: groupedPackages.basic.length,
      full: groupedPackages.full.length,
      live_tv: groupedPackages.live_tv.length
    };
    
    res.json({
      success: true,
      packages: groupedPackages,
      total: packages.length,
      breakdown: breakdown
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
 * POST /api/iptv/sync-packages - Force sync packages from panel (enhanced for trial + paid)
 */
router.post('/sync-packages', async (req, res) => {
  try {
    console.log('🔄 Starting package sync (trial + paid)...');
    
    await iptvService.initialize();
    const count = await iptvService.syncPackagesFromPanel();
    
    // Get breakdown after sync
    const packages = await iptvService.getAvailablePackages();
    const breakdown = {
      trial: packages.filter(p => p.package_type === 'trial').length,
      basic: packages.filter(p => p.package_type === 'basic').length,
      full: packages.filter(p => p.package_type === 'full').length,
      live_tv: packages.filter(p => p.package_type === 'live_tv').length
    };
    
    res.json({
      success: true,
      message: `Successfully synced ${count} packages from panel`,
      count: count,
      breakdown: breakdown
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
 * GET /api/iptv/channel-groups/:id - Get specific channel group by ID - NEW ROUTE
 */
router.get('/channel-groups/:id', [
  param('id').isInt().withMessage('Invalid group ID'),
  handleValidationErrors
], async (req, res) => {
  console.log('🔍 Channel group route called with ID:', req.params.id); // ADD THIS LINE
try {
  const { id } = req.params;
  console.log('🔍 Looking for channel group ID:', id);
  
  const result = await db.query(`
    SELECT id, name, description, bouquet_ids, is_active, created_at, updated_at
    FROM iptv_channel_groups 
    WHERE id = ?
  `, [id]);
  
  console.log('🔍 Database result:', result);
  console.log('🔍 Result type:', typeof result);
  console.log('🔍 Is array?:', Array.isArray(result));
  
// Handle different return formats from mysql2
const rows = Array.isArray(result) ? result[0] : result;

console.log('🔍 Processed rows:', rows);
console.log('🔍 Rows type:', typeof rows);
console.log('🔍 Rows is array?:', Array.isArray(rows));

// If rows is an array, get the first item. If it's an object, use it directly
let group;
if (Array.isArray(rows)) {
  if (rows.length === 0) {
    console.log('❌ No rows found in array');
    return res.status(404).json({
      success: false,
      message: 'Channel group not found'
    });
  }
  group = rows[0];
} else if (rows && typeof rows === 'object') {
  // Single object result
  group = rows;
} else {
  console.log('❌ Invalid result format');
  return res.status(404).json({
    success: false,
    message: 'Channel group not found'
  });
}
  console.log('✅ Found group:', group);
    
    // Parse bouquet_ids JSON
    const parsedGroup = {
      ...group,
      bouquet_ids: typeof group.bouquet_ids === 'string' 
        ? JSON.parse(group.bouquet_ids) 
        : group.bouquet_ids
    };
    
    res.json({
      success: true,
      channelGroup: parsedGroup
    });
  } catch (error) {
    console.error('❌ Error getting channel group:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get channel group',
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
 * GET /api/iptv/user/:id - Get user's IPTV status - FIXED VERSION
 */
router.get('/user/:id', [
  param('id').isInt().withMessage('Invalid user ID'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get user's IPTV data from database - FIXED: Added missing fields
    const result = await db.query(`
      SELECT 
        u.id, u.name, u.email, u.iptv_username, u.iptv_password, u.iptv_line_id,
        u.iptv_package_id, u.iptv_package_name, u.iptv_expiration,
        u.iptv_credits_used, u.iptv_channel_group_id, u.iptv_connections,
        u.iptv_is_trial, u.iptv_m3u_url,
        cg.name as channel_group_name,
        cg.description as channel_group_description
      FROM users u
      LEFT JOIN iptv_channel_groups cg ON u.iptv_channel_group_id = cg.id
      WHERE u.id = ?
    `, [id]);
    
    // Handle mysql2 result format - db.query() returns direct results array
    if (!result || !Array.isArray(result) || result.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const user = result[0];
    
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
 * POST /api/iptv/subscription - Create or extend IPTV subscription with data retrieval
 * FIXED VERSION - Only changed the data extraction and response structure
 */
router.post('/subscription', [
  body('user_id').isInt().withMessage('Invalid user ID'),
  body('package_id').notEmpty().withMessage('Package ID is required'),
  body('channel_group_id').isInt().withMessage('Channel group ID is required'),
  body('action').isIn(['create_trial', 'create_paid', 'extend']).withMessage('Invalid action'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { user_id, package_id, channel_group_id, action, username, password, notes } = req.body;
    
    console.log('🔄 Processing IPTV subscription request:', { user_id, package_id, channel_group_id, action, username });
    
    await iptvService.initialize();
    
    // Get user data - FIXED QUERY RESULT HANDLING
    const userResult = await db.query('SELECT * FROM users WHERE id = ?', [user_id]);
    console.log('📊 Raw user query result:', userResult);
    console.log('📊 User result type:', typeof userResult);
    console.log('📊 User result is array:', Array.isArray(userResult));
    
    // Handle different possible result structures from mysql2
    let user = null;
    if (Array.isArray(userResult) && userResult.length > 0) {
      user = userResult[0];
    } else if (userResult && Array.isArray(userResult[0]) && userResult[0].length > 0) {
      user = userResult[0][0];
    } else if (userResult && userResult.id) {
      // Direct object result
      user = userResult;
    }
    
    if (!user) {
      console.error('❌ User not found for ID:', user_id);
      console.error('❌ Raw result was:', userResult);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    console.log('✅ Found user:', { id: user.id, name: user.name, email: user.email });
    
    // Get package information - FIXED QUERY RESULT HANDLING
    const packageResult = await db.query('SELECT * FROM iptv_packages WHERE package_id = ?', [package_id]);
    console.log('📊 Raw package query result:', packageResult);
    
    let packageInfo = null;
    if (Array.isArray(packageResult) && packageResult.length > 0) {
      packageInfo = packageResult[0];
    } else if (packageResult && Array.isArray(packageResult[0]) && packageResult[0].length > 0) {
      packageInfo = packageResult[0][0];
    } else if (packageResult && packageResult.package_id) {
      packageInfo = packageResult;
    }
    
    if (!packageInfo) {
      console.error('❌ Package not found for ID:', package_id);
      console.error('❌ Raw package result was:', packageResult);
      return res.status(404).json({
        success: false,
        message: 'Package not found'
      });
    }
    
    console.log('✅ Found package:', { id: packageInfo.package_id, name: packageInfo.package_name, type: packageInfo.package_type });
    
// Get channel group bouquets - ENHANCED DEBUGGING
    const channelGroupResult = await db.query('SELECT bouquet_ids FROM iptv_channel_groups WHERE id = ?', [channel_group_id]);
    console.log('📊 Raw channel group query result:', channelGroupResult);
    console.log('📊 Channel group result type:', typeof channelGroupResult);
    console.log('📊 Channel group result is array:', Array.isArray(channelGroupResult));
    console.log('📊 Channel group result length:', channelGroupResult?.length);
    
    let channelGroup = null;
    if (Array.isArray(channelGroupResult) && channelGroupResult.length > 0) {
      channelGroup = channelGroupResult[0];
      console.log('📊 Used direct array access - channelGroup:', channelGroup);
    } else if (channelGroupResult && Array.isArray(channelGroupResult[0]) && channelGroupResult[0].length > 0) {
      channelGroup = channelGroupResult[0][0];
      console.log('📊 Used nested array access - channelGroup:', channelGroup);
    } else if (channelGroupResult && channelGroupResult.bouquet_ids) {
      channelGroup = channelGroupResult;
      console.log('📊 Used direct object access - channelGroup:', channelGroup);
    }
    
    console.log('📊 Final channelGroup value:', channelGroup);
    console.log('📊 channelGroup type:', typeof channelGroup);
    console.log('📊 channelGroup has bouquet_ids:', !!channelGroup?.bouquet_ids);
    console.log('📊 bouquet_ids value:', channelGroup?.bouquet_ids);
    console.log('📊 bouquet_ids type:', typeof channelGroup?.bouquet_ids);
    
    if (!channelGroup || !channelGroup.bouquet_ids) {
      console.error('❌ Channel group not found for ID:', channel_group_id);
      console.error('❌ Raw channel group result was:', channelGroupResult);
      return res.status(404).json({
        success: false,
        message: 'Channel group not found'
      });
    }
    
    console.log('✅ Found channel group with bouquets:', channelGroup.bouquet_ids);
    
    // Handle bouquet IDs - keep as comma-separated string for IPTV API
    let bouquetIds = channelGroup.bouquet_ids;
    
    // If it's stored as JSON array, convert to comma-separated string
    if (typeof bouquetIds === 'string' && bouquetIds.startsWith('[')) {
      try {
        const parsed = JSON.parse(bouquetIds);
        bouquetIds = parsed.join(',');
      } catch (error) {
        console.warn('⚠️ Failed to parse JSON bouquet IDs, using as-is');
      }
    }
    
    console.log('✅ Final bouquet IDs for API:', bouquetIds);
    console.log('✅ Bouquet IDs type:', typeof bouquetIds);
    
    // Check credits for paid subscriptions
    if (action === 'create_paid') {
      const currentBalance = await iptvService.getLocalCreditBalance();
      if (currentBalance < (packageInfo.credits || 0)) {
        return res.status(400).json({
          success: false,
          message: `Insufficient credits. Required: ${packageInfo.credits || 0}, Available: ${currentBalance}`
        });
      }
    }
    
    // Call IPTV service to create subscription
    let result;
    let finalUsername = username || user.iptv_username;
    let finalPassword = password || user.iptv_password;
    
    switch (action) {
      case 'create_trial':
        if (!finalUsername) {
          return res.status(400).json({
            success: false,
            message: 'Username is required for trial creation'
          });
        }
        result = await iptvService.createTrialUserWithData(finalUsername, finalPassword, package_id, bouquetIds);
        break;
        
      case 'create_paid':
        if (!finalUsername) {
          return res.status(400).json({
            success: false,
            message: 'Username is required for paid subscription creation'
          });
        }
        result = await iptvService.createPaidUserWithData(finalUsername, finalPassword, package_id, bouquetIds);
        break;
        
      case 'extend':
        if (!user.iptv_line_id) {
          return res.status(400).json({
            success: false,
            message: 'No existing IPTV subscription to extend'
          });
        }
        result = await iptvService.extendUserWithData(user.iptv_line_id, package_id, bouquetIds, user.iptv_username);
        finalUsername = user.iptv_username;
        break;
    }
    
    if (!result || !result.success) {
      console.error('❌ IPTV service failed:', result?.message || 'Unknown error');
      return res.status(400).json({
        success: false,
        message: result?.message || 'IPTV service failed'
      });
    }
    
    console.log('✅ IPTV service success:', result);
    
    // FIXED: Extract data correctly from service result
    const { userData, m3uPlusURL } = result;
    
    // FIXED: Use the actual password from userData (this is the key fix!)
    const actualPassword = userData?.password || finalPassword;
    
    // Use retrieved data or calculate fallbacks
    const finalLineId = userData?.line_id || result.line_id;
    const finalExpirationDate = userData?.expiration_date || result.expiration_date || 
      iptvService.calculateExpirationDate(packageInfo, action === 'extend', user.iptv_expiration);
    const maxConnections = userData?.max_connections || packageInfo.connections || 0;
    const finalM3UUrl = m3uPlusURL || (finalUsername && actualPassword ? 
      iptvService.generateM3UPlusURL(finalUsername, actualPassword) : null);
    
    // Convert expiration date for database storage
    const expirationForDB = finalExpirationDate instanceof Date ? 
      finalExpirationDate.toISOString().slice(0, 19).replace('T', ' ') : 
      finalExpirationDate;
    
    // Calculate credits used
    const creditsUsed = action === 'create_trial' ? 0 : (packageInfo.credits || 0);
    
    // FIXED: Update database with the correct password
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
        iptv_m3u_url = ?,
        iptv_notes = ?,
        updated_at = NOW()
      WHERE id = ?
    `, [
      finalUsername,
      actualPassword, // FIXED: Use the actual password from panel
      finalLineId,
      package_id,
      packageInfo.package_name || packageInfo.name,
      expirationForDB,
      creditsUsed,
      channel_group_id,
      maxConnections,
      action === 'create_trial',
      finalM3UUrl,
      notes || null,
      user_id
    ]);
    
    // Log the activity
    await iptvService.logActivity(
      user_id, 
      finalLineId, 
      action, 
      package_id, 
      creditsUsed, 
      true, 
      notes || null, 
      result
    );
    
    // Sync credit balance after successful creation
    if (action === 'create_paid') {
      await iptvService.syncCreditBalance();
    }
    
    console.log(`✅ IPTV subscription ${action} completed for user ${user_id}`);
    
    // FIXED: Return response with correct password data
    res.json({
      success: true,
      message: `IPTV subscription ${action.replace('_', ' ')} successful`,
      data: {
        user_id: user_id,
        
        // CRITICAL FIX: Return the actual password from panel
        username: finalUsername,
        password: actualPassword, // This will now be the real password
        iptv_username: finalUsername, // Alternative field name
        iptv_password: actualPassword, // Alternative field name
        
        line_id: finalLineId,
        iptv_line_id: finalLineId, // Alternative field name
        package_id: package_id,
        package_name: packageInfo.package_name || packageInfo.name,
        expiration_date: expirationForDB,
        iptv_expiration: expirationForDB, // Alternative field name
        expiration_formatted: userData?.expiration_formatted,
        days_until_expiration: userData?.days_until_expiration,
        max_connections: maxConnections,
        iptv_connections: maxConnections, // Alternative field name
        current_connections: userData?.current_connections || 0,
        active_connections: userData?.current_connections || 0, // Alternative field name
        is_trial: action === 'create_trial',
        iptv_is_trial: action === 'create_trial', // Alternative field name
        enabled: userData?.enabled !== false,
        m3u_plus_url: finalM3UUrl,
        iptv_m3u_url: finalM3UUrl, // Alternative field name
        m3u_url: finalM3UUrl, // Alternative field name
        credits_used: creditsUsed,
        panel_data_retrieved: !!userData, // Flag for frontend
        notes: notes,
        
        // Additional metadata
        created_at: userData?.created_at,
        owner: userData?.owner
      }
    });
  } catch (error) {
    console.error('❌ Error processing IPTV subscription:', error);
    
    // Log the failed activity
    try {
      await iptvService.logActivity(
        req.body.user_id, 
        null, 
        req.body.action, 
        req.body.package_id, 
        0, 
        false, 
        error.message, 
        null
      );
    } catch (logError) {
      console.error('❌ Failed to log error activity:', logError);
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to process IPTV subscription',
      error: error.message
    });
  }
});

/**
 * POST /api/iptv/match-existing-user - Match existing IPTV panel user to local user
 */
router.post('/match-existing-user', [
  body('user_id').isInt().withMessage('Invalid user ID'),
  body('iptv_username').notEmpty().withMessage('IPTV username is required'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { user_id, iptv_username } = req.body;
    
    console.log(`🔍 Searching for existing IPTV user: ${iptv_username} for local user ID: ${user_id}`);
    
    await iptvService.initialize();
    
    // Get user data from local database
    const userResult = await db.query('SELECT * FROM users WHERE id = ?', [user_id]);
    let user = null;
    if (Array.isArray(userResult) && userResult.length > 0) {
      user = userResult[0];
    } else if (userResult && Array.isArray(userResult[0]) && userResult[0].length > 0) {
      user = userResult[0][0];
    }
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Local user not found'
      });
    }
    
    // Search for IPTV user in panel using /lines/data endpoint
    const panelUsers = await iptvService.getAllPanelUsers();
    
    if (!panelUsers || !Array.isArray(panelUsers)) {
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve panel users data'
      });
    }
    
    // Find matching user by username
    const matchingUser = panelUsers.find(panelUser => 
      panelUser.username === iptv_username
    );
    
    if (!matchingUser) {
      return res.status(404).json({
        success: false,
        message: `IPTV user '${iptv_username}' not found in panel`
      });
    }
    
    console.log('✅ Found matching IPTV user:', matchingUser);
    
    // Extract and format the data
    const expirationDate = matchingUser.expire_date 
      ? new Date(matchingUser.expire_date * 1000) // Convert Unix timestamp
      : null;
    
    const expirationForDB = expirationDate ? 
      expirationDate.toISOString().slice(0, 19).replace('T', ' ') : null;
    
    // Generate M3U URL
    const m3uUrl = iptvService.generateM3UPlusURL(matchingUser.username, matchingUser.password);
    
    // Update local user with retrieved IPTV data
    await db.query(`
      UPDATE users SET 
        iptv_username = ?,
        iptv_password = ?,
        iptv_line_id = ?,
        iptv_expiration = ?,
        iptv_connections = ?,
        iptv_is_trial = ?,
        iptv_m3u_url = ?,
        updated_at = NOW()
      WHERE id = ?
    `, [
      matchingUser.username,
      matchingUser.password,
      matchingUser.id,
      expirationForDB,
      matchingUser.user_connection || matchingUser.connections || 0,
      matchingUser.is_trial || 0,
      m3uUrl,
      user_id
    ]);
    
    // Log the activity
    await iptvService.logActivity(
      user_id, 
      matchingUser.id, 
      'match_existing', 
      null, 
      0, 
      true, 
      'Matched existing IPTV user from panel', 
      matchingUser
    );
    
    console.log(`✅ Successfully matched and updated user ${user_id} with IPTV data`);
    
    // Return the matched user data
    res.json({
      success: true,
      message: 'Successfully matched existing IPTV user',
      iptv_data: {
        username: matchingUser.username,
        line_id: matchingUser.id,
        expiration: expirationForDB,
        expiration_formatted: expirationDate ? expirationDate.toLocaleDateString() : 'None',
        connections: matchingUser.user_connection || matchingUser.connections || 0,
        active_connections: matchingUser.active_connections || 0,
        is_trial: Boolean(matchingUser.is_trial),
        enabled: Boolean(matchingUser.enabled),
        m3u_url: m3uUrl,
        panel_data: matchingUser
      }
    });
    
  } catch (error) {
    console.error('❌ Error matching existing IPTV user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to match existing IPTV user',
      error: error.message
    });
  }
});

/**
 * POST /api/iptv/link-existing-user - Link existing IPTV account to user and save to database
 */
router.post('/link-existing-user', [
  body('user_id').isInt().withMessage('Invalid user ID'),
  body('iptv_data').isObject().withMessage('IPTV data is required'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { user_id, iptv_data } = req.body;
    
    console.log(`🔗 Linking existing IPTV account to user ${user_id}:`, iptv_data);
    
    // Extract password from panel_data if it exists, otherwise try direct property
    const password = iptv_data.panel_data?.password || iptv_data.password || null;
    
    // Update the user with IPTV information
    const updateResult = await db.query(`
      UPDATE users SET 
        iptv_username = ?,
        iptv_password = ?,
        iptv_line_id = ?,
        iptv_expiration = ?,
        iptv_connections = ?,
        iptv_is_trial = ?,
        iptv_m3u_url = ?,
        updated_at = NOW()
      WHERE id = ?
    `, [
      iptv_data.username || null,
      password,
      iptv_data.line_id || null,
      iptv_data.expiration || null,  // Fixed: was expiration_date
      iptv_data.connections || null,
      iptv_data.is_trial ? 1 : 0,
      iptv_data.m3u_url || null,     // Fixed: was m3u_plus_url
      user_id
    ]);
    
    console.log('📊 Update result:', updateResult);
    
    // Get the updated user data
    const userResult = await db.query('SELECT * FROM users WHERE id = ?', [user_id]);
    const user = Array.isArray(userResult) && userResult.length > 0 ? userResult[0] : null;
    
    if (!user) {
      throw new Error('Failed to retrieve updated user data');
    }
    
    res.json({
      success: true,
      message: 'IPTV account linked successfully',
      user: user
    });
    
  } catch (error) {
    console.error('❌ Error linking existing IPTV account:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to link existing IPTV account',
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
 * GET /api/iptv/debug-auth - Debug current authentication state
 */
router.get('/debug-auth', async (req, res) => {
  try {
    await iptvService.initialize();
    
    res.json({
      csrf_token: iptvService.csrfToken ? iptvService.csrfToken.substring(0, 20) + '...' : 'None',
      session_cookies: iptvService.sessionCookies ? iptvService.sessionCookies.substring(0, 100) + '...' : 'None',
      csrf_expires: iptvService.csrfExpires,
      is_authenticated: iptvService.isAuthenticated(),
      base_url: iptvService.baseURL,
      login_url: iptvService.loginURL
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
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

/**
 * GET /api/iptv/packages/trial - Get only trial packages
 */
router.get('/packages/trial', async (req, res) => {
  try {
    const allPackages = await iptvService.getAvailablePackages();
    const trialPackages = allPackages.filter(p => p.package_type === 'trial');
    
    res.json({
      success: true,
      packages: trialPackages,
      total: trialPackages.length
    });
  } catch (error) {
    console.error('❌ Error getting trial packages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get trial packages',
      error: error.message
    });
  }
});

/**
 * GET /api/iptv/packages/paid - Get only paid packages
 */
router.get('/packages/paid', async (req, res) => {
  try {
    const allPackages = await iptvService.getAvailablePackages();
    const paidPackages = allPackages.filter(p => p.package_type !== 'trial');
    
    res.json({
      success: true,
      packages: paidPackages,
      total: paidPackages.length
    });
  } catch (error) {
    console.error('❌ Error getting paid packages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get paid packages',
      error: error.message
    });
  }
});

/**
 * GET /api/iptv/packages/stats - Get package statistics
 */
router.get('/packages/stats', async (req, res) => {
  try {
    const packages = await iptvService.getAvailablePackages();
    
    const stats = {
      total: packages.length,
      by_type: {
        trial: packages.filter(p => p.package_type === 'trial').length,
        basic: packages.filter(p => p.package_type === 'basic').length,
        full: packages.filter(p => p.package_type === 'full').length,
        live_tv: packages.filter(p => p.package_type === 'live_tv').length
      }
    };
    
    res.json({
      success: true,
      stats: stats
    });
  } catch (error) {
    console.error('❌ Error getting package stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get package statistics',
      error: error.message
    });
  }
});

module.exports = router;