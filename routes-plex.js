const express = require('express');
const plexService = require('./plex-service');
const db = require('./database-config');
const router = express.Router();
const { spawn } = require('child_process');

// Get libraries for a server group (plex1 or plex2) - FIXED
router.get('/libraries/:serverGroup', async (req, res) => {
  try {
    const { serverGroup } = req.params;
    
    if (!['plex1', 'plex2'].includes(serverGroup)) {
      return res.status(400).json({ error: 'Invalid server group. Use plex1 or plex2' });
    }
    
    console.log(`📚 API: Getting libraries for ${serverGroup}`);
    const libraries = await plexService.getLibrariesForGroup(serverGroup);
    
    console.log(`✅ API: Returning ${libraries.regular?.length || 0} regular + ${libraries.fourk?.length || 0} 4K libraries for ${serverGroup}`);
    res.json(libraries);
  } catch (error) {
    console.error(`❌ Error fetching libraries for ${req.params.serverGroup}:`, error);
    res.status(500).json({ error: 'Failed to fetch libraries' });
  }
});

// Get user's current library access
router.get('/user-access/:email', async (req, res) => {
  try {
    const { email } = req.params;
    console.log(`🔍 API: Getting access for ${email}`);
    
    const access = await plexService.getUserCurrentAccess(email);
    res.json(access);
  } catch (error) {
    console.error('Error fetching user access:', error);
    res.status(500).json({ error: 'Failed to fetch user access' });
  }
});

// Check user invite status
router.get('/invite-status/:email', async (req, res) => {
  try {
    const { email } = req.params;
    console.log(`📧 API: Checking invite status for ${email}`);
    
    const inviteStatus = await plexService.checkUserPendingInvites(email);
    
    // Return structured response
    res.json({
      success: true,
      email: email,
      has_pending_invites: !!inviteStatus,
      pending_invites: inviteStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error checking invite status:', error);
    res.status(500).json({ error: 'Failed to check invite status' });
  }
});

// ENHANCED: Comprehensive user library sharing endpoint
router.post('/share-user-libraries', async (req, res) => {
  try {
    const { userEmail, plexLibraries, isNewUser = false } = req.body;
    
    if (!userEmail || !plexLibraries) {
      return res.status(400).json({ 
        error: 'Missing required fields: userEmail, plexLibraries' 
      });
    }
    
    console.log(`🔄 API: Enhanced sharing for ${userEmail} (new user: ${isNewUser})`);
    console.log(`📚 Requested libraries:`, plexLibraries);
    
    let currentAccess = {};
    
    // For existing users, get their current access first
    if (!isNewUser) {
      console.log(`🔍 Getting current access for existing user...`);
      currentAccess = await plexService.getUserCurrentAccess(userEmail);
      console.log(`📊 Current access:`, currentAccess);
    }
    
    const results = {};
    const errors = [];
    let totalChanges = 0;
    let actualApiCalls = 0;
    
    // Process each server group in the request
    for (const [serverGroup, libraries] of Object.entries(plexLibraries)) {
      if (!['plex1', 'plex2'].includes(serverGroup)) {
        console.log(`⚠️ Skipping invalid server group: ${serverGroup}`);
        continue;
      }
      
      // Check if any libraries are specified for this group
      const hasLibraries = (libraries.regular && libraries.regular.length > 0) || 
                          (libraries.fourk && libraries.fourk.length > 0);
      
      if (!hasLibraries) {
        console.log(`⚠️ No libraries specified for ${serverGroup}, skipping`);
        results[serverGroup] = { 
          success: true, 
          action: 'skipped', 
          message: 'No libraries specified',
          changes: 0
        };
        continue;
      }
      
      try {
        console.log(`🔄 Processing ${serverGroup} sharing...`);
        
        // Use the enhanced sharing method
        const result = await plexService.shareLibrariesWithUser(userEmail, serverGroup, libraries);
        
        results[serverGroup] = result;
        
        if (result.success) {
          console.log(`✅ ${serverGroup} sharing completed successfully`);
          
          // Count actual changes made
          const changes = result.changes || 0;
          totalChanges += changes;
          
          if (changes > 0) {
            actualApiCalls += changes;
            console.log(`   📡 Made ${changes} API calls to Plex servers`);
          } else {
            console.log(`   ✅ No changes needed - user already has correct access`);
          }
        }
      } catch (error) {
        console.error(`❌ Error sharing ${serverGroup}:`, error);
        results[serverGroup] = { success: false, error: error.message, changes: 0 };
        errors.push(`${serverGroup}: ${error.message}`);
      }
    }
    
    // Determine overall success
    const overallSuccess = errors.length === 0;
    const hasActions = Object.values(results).some(r => r.action !== 'skipped');
    
    let message = 'Library sharing process completed';
    let messageDetails = [];
    
    if (!hasActions) {
      message = 'No library changes were needed';
    } else if (!overallSuccess) {
      message = 'Some library sharing operations had issues';
      messageDetails.push(`Errors: ${errors.length}`);
    } else if (totalChanges === 0) {
      message = 'User already had the correct library access - no changes needed';
    } else if (actualApiCalls > 0) {
      message = `Library access updated successfully`;
      messageDetails.push(`${actualApiCalls} Plex API calls made`);
      messageDetails.push(`${totalChanges} servers modified`);
    }
    
    if (messageDetails.length > 0) {
      message += ` (${messageDetails.join(', ')})`;
    }
    
    console.log(`📊 Overall result: ${overallSuccess ? 'SUCCESS' : 'PARTIAL FAILURE'}`);
    console.log(`📊 Total changes detected: ${totalChanges}`);
    console.log(`📊 Actual Plex API calls made: ${actualApiCalls}`);
    console.log(`📊 Results:`, results);
    
    res.json({
      success: overallSuccess,
      message: message,
      isNewUser: isNewUser,
      previousAccess: currentAccess,
      results: results,
      errors: errors.length > 0 ? errors : undefined,
      totalChanges: totalChanges,
      apiCallsMade: actualApiCalls,
      note: 'Real Plex API integration - actual invites and library sharing performed'
    });
    
  } catch (error) {
    console.error('❌ Error in comprehensive sharing:', error);
    res.status(500).json({ error: 'Failed to share user libraries' });
  }
});

// Legacy sharing endpoint (for backward compatibility)
router.post('/share', async (req, res) => {
  try {
    const { userEmail, serverGroup, libraries } = req.body;
    
    if (!userEmail || !serverGroup || !libraries) {
      return res.status(400).json({ error: 'Missing required fields: userEmail, serverGroup, libraries' });
    }
    
    if (!['plex1', 'plex2'].includes(serverGroup)) {
      return res.status(400).json({ error: 'Invalid server group. Use plex1 or plex2' });
    }
    
    console.log(`🔄 API: Legacy sharing ${userEmail} on ${serverGroup}`);
    
    const result = await plexService.shareLibrariesWithUser(userEmail, serverGroup, libraries);
    res.json(result);
    
  } catch (error) {
    console.error('Error in legacy sharing:', error);
    res.status(500).json({ error: 'Failed to share libraries' });
  }
});

// Remove user from Plex
router.post('/remove-user', async (req, res) => {
  try {
    const { userEmail, serverGroup } = req.body;
    
    if (!userEmail || !serverGroup) {
      return res.status(400).json({ error: 'Missing required fields: userEmail, serverGroup' });
    }
    
    if (!['plex1', 'plex2'].includes(serverGroup)) {
      return res.status(400).json({ error: 'Invalid server group. Use plex1 or plex2' });
    }
    
    console.log(`🗑️ API: Removing ${userEmail} from ${serverGroup}`);
    
    const result = await plexService.removeUserFromPlex(userEmail, serverGroup);
    res.json(result);
    
  } catch (error) {
    console.error('Error removing user:', error);
    res.status(500).json({ error: 'Failed to remove user from Plex' });
  }
});

// Test server connection
router.post('/test/:serverGroup', async (req, res) => {
  try {
    const { serverGroup } = req.params;
    
    if (!['plex1', 'plex2'].includes(serverGroup)) {
      return res.status(400).json({ error: 'Invalid server group. Use plex1 or plex2' });
    }
    
    const result = await plexService.testConnection(serverGroup);
    res.json(result);
  } catch (error) {
    console.error('Error testing connection:', error);
    res.status(500).json({ error: 'Failed to test connection' });
  }
});

// Manually trigger library sync
router.post('/sync', async (req, res) => {
  try {
    console.log('🔄 API: Manual library sync triggered');
    const result = await plexService.syncAllLibraries();
    
    if (result.success) {
      res.json({ 
        success: true,
        message: 'Library sync completed successfully',
        timestamp: result.timestamp 
      });
    } else {
      res.status(500).json({ 
        success: false,
        error: 'Library sync failed', 
        details: result.error 
      });
    }
  } catch (error) {
    console.error('Error syncing libraries:', error);
    res.status(500).json({ error: 'Failed to sync libraries' });
  }
});

// Get all server groups and their status
router.get('/servers', async (req, res) => {
  try {
    const servers = {
      plex1: {
        name: 'Plex 1 Group',
        regular: 'Plex 1',
        fourk: 'Plex 1 4K'
      },
      plex2: {
        name: 'Plex 2 Group', 
        regular: 'Plex 2',
        fourk: 'Plex 2 4K'
      }
    };
    
    res.json(servers);
  } catch (error) {
    console.error('Error fetching servers:', error);
    res.status(500).json({ error: 'Failed to fetch servers' });
  }
});

// ENHANCED DEBUG: Get comprehensive user Plex status
router.get('/debug/user/:email', async (req, res) => {
  try {
    const { email } = req.params;
    console.log(`🔍 DEBUG: Enhanced check for ${email}`);
    
    const serverConfigs = plexService.getServerConfig();
    const debugInfo = {};
    
    // Check each server group with real-time API calls
    for (const [groupName, groupConfig] of Object.entries(serverConfigs)) {
      debugInfo[groupName] = {};
      
      try {
        console.log(`🔍 Checking ${groupName} servers for ${email}...`);
        
        // Check regular server
        const regularUsers = await plexService.getAllSharedUsersFromServer(groupConfig.regular);
        const regularUser = regularUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
        debugInfo[groupName].regular = {
          server: groupConfig.regular.name,
          found: !!regularUser,
          libraries: regularUser ? regularUser.libraries.length : 0,
          libraryIds: regularUser ? regularUser.libraries.map(lib => lib.id) : [],
          libraryNames: regularUser ? regularUser.libraries.map(lib => lib.title) : [],
          sharedServerId: regularUser ? regularUser.sharedServerId : null
        };
        
        // Check 4K server
        const fourkUsers = await plexService.getAllSharedUsersFromServer(groupConfig.fourk);
        const fourkUser = fourkUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
        debugInfo[groupName].fourk = {
          server: groupConfig.fourk.name,
          found: !!fourkUser,
          libraries: fourkUser ? fourkUser.libraries.length : 0,
          libraryIds: fourkUser ? fourkUser.libraries.map(lib => lib.id) : [],
          libraryNames: fourkUser ? fourkUser.libraries.map(lib => lib.title) : [],
          sharedServerId: fourkUser ? fourkUser.sharedServerId : null
        };
        
      } catch (error) {
        debugInfo[groupName].error = error.message;
      }
    }
    
    // Get database info
    const [dbUser] = await db.query(`
      SELECT id, name, email, plex_email, tags, plex_libraries, pending_plex_invites
      FROM users 
      WHERE email = ? OR plex_email = ?
    `, [email, email]);
    
    // Get cached access using our method
    const cachedAccess = await plexService.getUserCurrentAccess(email);
    
    // Check pending invites
    const pendingInvites = await plexService.checkUserPendingInvites(email);
    
    res.json({
      email: email,
      realTimeStatus: debugInfo,
      databaseUser: dbUser ? {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        plex_email: dbUser.plex_email,
        tags: JSON.parse(dbUser.tags || '[]'),
        stored_plex_libraries: JSON.parse(dbUser.plex_libraries || '{}'),
        stored_pending_invites: JSON.parse(dbUser.pending_plex_invites || 'null')
      } : null,
      cachedAccess: cachedAccess,
      currentPendingInvites: pendingInvites,
      summary: {
        totalPlexLibraries: Object.values(debugInfo).reduce((total, group) => {
          return total + (group.regular?.libraries || 0) + (group.fourk?.libraries || 0);
        }, 0),
        hasAnyAccess: Object.values(debugInfo).some(group => 
          (group.regular?.found) || (group.fourk?.found)
        ),
        hasPendingInvites: !!pendingInvites
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error in enhanced debug endpoint:', error);
    res.status(500).json({ error: 'Failed to get debug info' });
  }
});

// SIMPLE DEBUG: Test library update for a specific user
router.post('/debug/test-update/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const { serverGroup, libraries } = req.body;
    
    if (!serverGroup || !libraries) {
      return res.status(400).json({ 
        error: 'Missing required fields: serverGroup, libraries' 
      });
    }
    
    console.log(`🔍 DEBUG: Testing library update for ${email} on ${serverGroup}`);
    console.log(`📚 Test libraries:`, libraries);
    
    // Get current access first
    const currentAccess = await plexService.getUserCurrentAccess(email);
    console.log(`📊 Current access:`, currentAccess);
    
    // Test the update
    const result = await plexService.shareLibrariesWithUser(email, serverGroup, libraries);
    console.log(`📊 Update result:`, result);
    
    res.json({
      success: true,
      email: email,
      serverGroup: serverGroup,
      requestedLibraries: libraries,
      currentAccess: currentAccess,
      updateResult: result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error in debug test update:', error);
    res.status(500).json({ error: 'Failed to test library update' });
  }
});

// Force refresh libraries from API
router.post('/refresh-libraries/:serverGroup', async (req, res) => {
  try {
    const { serverGroup } = req.params;
    
    if (!['plex1', 'plex2'].includes(serverGroup)) {
      return res.status(400).json({ error: 'Invalid server group. Use plex1 or plex2' });
    }
    
    console.log(`🔄 API: Force refreshing libraries for ${serverGroup}`);
    
    const serverConfigs = plexService.getServerConfig();
    const config = serverConfigs[serverGroup];
    
    if (!config) {
      return res.status(400).json({ error: `Configuration not found for ${serverGroup}` });
    }
    
    // Force fetch from API
    const regularLibs = await plexService.getServerLibraries(config.regular);
    
    // Update database
    await plexService.updateLibrariesInDatabase(serverGroup, 'regular', regularLibs);
    
    // Get the fresh data
    const freshLibraries = await plexService.getLibrariesForGroup(serverGroup);
    
    console.log(`✅ Force refresh complete for ${serverGroup}: ${freshLibraries.regular.length} regular + ${freshLibraries.fourk.length} 4K libraries`);
    
    res.json({
      success: true,
      serverGroup: serverGroup,
      libraries: freshLibraries,
      message: `Successfully refreshed ${freshLibraries.regular.length} regular libraries`
    });
    
  } catch (error) {
    console.error(`Error force refreshing libraries for ${req.params.serverGroup}:`, error);
    res.status(500).json({ error: 'Failed to refresh libraries' });
  }
});

// Refresh user data for editing (updates their current access and pending status)
router.post('/refresh-user-data', async (req, res) => {
  try {
    const { userEmail } = req.body;
    
    if (!userEmail) {
      return res.status(400).json({ error: 'Missing userEmail' });
    }
    
    console.log(`🔄 API: Refreshing user data for editing: ${userEmail}`);
    
    const result = await plexService.refreshUserDataForEditing(userEmail);
    
    if (result.success) {
      console.log(`✅ API: User data refreshed successfully for ${userEmail}`);
      res.json(result);
    } else {
      console.log(`❌ API: Failed to refresh user data for ${userEmail}:`, result.error);
      res.status(500).json({ error: result.error });
    }
    
  } catch (error) {
    console.error('❌ Error in refresh user data route:', error);
    res.status(500).json({ error: 'Failed to refresh user data' });
  }
});

// GET /api/plex/dashboard-stats - Get cached Plex statistics for dashboard
router.get('/dashboard-stats', async (req, res) => {
  try {
    console.log('📊 Getting Plex dashboard statistics...');
    
    // Check if we have recent cached data
    const [cachedStats] = await db.query(`
      SELECT stat_key, stat_value, last_updated 
      FROM plex_statistics 
      WHERE stat_key IN ('hd_movies', 'anime_movies', 'fourk_movies', 'tv_shows', 'tv_seasons', 'tv_episodes', 'audiobooks')
      ORDER BY last_updated DESC
    `);
    
    // FIX: Check if cachedStats array is empty or undefined
    if (!cachedStats || cachedStats.length === 0) {
      console.log('📊 No cached stats found, generating fresh stats...');
      await refreshPlexStats();
      
      // Get the fresh stats
      const [freshStats] = await db.query(`
        SELECT stat_key, stat_value 
        FROM plex_statistics 
        WHERE stat_key IN ('hd_movies', 'anime_movies', 'fourk_movies', 'tv_shows', 'tv_seasons', 'tv_episodes', 'audiobooks')
      `);
      
      const stats = buildStatsResponse(freshStats || []);
      return res.json(stats);
    }
    
    // FIX: Check if first result exists before accessing last_updated
    const lastUpdate = cachedStats[0] && cachedStats[0].last_updated ? 
                       new Date(cachedStats[0].last_updated) : 
                       new Date(0); // Very old date to force refresh
    const fourHoursAgo = new Date(Date.now() - (4 * 60 * 60 * 1000));
    
    if (lastUpdate < fourHoursAgo) {
      console.log('📊 Cache is stale, refreshing in background...');
      // Refresh in background, don't wait
      refreshPlexStats().catch(err => console.error('Background refresh failed:', err));
    }
    
    const stats = buildStatsResponse(cachedStats);
    res.json(stats);
    
  } catch (error) {
    console.error('❌ Error getting Plex dashboard stats:', error);
    res.json({
      hdMovies: 0,
      animeMovies: 0,
      fourkMovies: 0,
      tvShows: 0,
      tvSeasons: 0,
      tvEpisodes: 0,
      audioBooks: 0,
      lastUpdate: 'Error'
    });
  }
});

// POST /api/plex/refresh-stats - Force refresh Plex statistics
router.post('/refresh-stats', async (req, res) => {
  try {
    console.log('🔄 Force refreshing Plex statistics...');
    await refreshPlexStats();
    
    // Get the fresh stats
    const [freshStats] = await db.query(`
      SELECT stat_key, stat_value 
      FROM plex_statistics 
      WHERE stat_key IN ('hd_movies', 'anime_movies', 'fourk_movies', 'tv_shows', 'tv_seasons', 'tv_episodes', 'audiobooks')
    `);
    
    const stats = buildStatsResponse(freshStats);
    
    res.json({
      success: true,
      message: 'Plex statistics refreshed successfully',
      stats: stats,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error refreshing Plex stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh Plex statistics',
      message: error.message
    });
  }
});

// GET /api/plex/dashboard-resources - Get cached server resources for dashboard
router.get('/dashboard-resources', async (req, res) => {
  try {
    console.log('📊 Getting cached Plex server resources for dashboard...');
    
    // Get all cached resource data
const allResources = await db.query(`
  SELECT server_group, server_type, resource_data, last_updated 
  FROM plex_server_resources 
  ORDER BY server_group, server_type
`);
	
	    console.log('🔍 DEBUG: Number of records returned:', allResources ? allResources.length : 0);
    console.log('🔍 DEBUG: All records:', allResources);
    
    // Check if cache is fresh (less than 2 minutes old)
    const cacheExpiry = 2 * 60 * 1000; // 2 minutes
    const now = new Date();
    let useCachedData = false;
    
    if (allResources && allResources.length > 0) {
      const lastUpdate = new Date(allResources[0].last_updated);
      const cacheAge = now.getTime() - lastUpdate.getTime();
      useCachedData = cacheAge < cacheExpiry;
    }
    
    if (!useCachedData) {
      console.log('📊 Cache is stale, refreshing server resources in background...');
      // Refresh in background, don't wait
      refreshPlexServerResources().catch(err => 
        console.error('Background resource refresh failed:', err)
      );
    }
    
    const formattedResources = formatDashboardResources(allResources || []);
    res.json(formattedResources);
    
  } catch (error) {
    console.error('❌ Error getting dashboard resources:', error);
    res.json(getDefaultResourceData());
  }
});

// GET /api/plex/server-resources - Get real-time server resource usage
router.get('/server-resources', async (req, res) => {
  try {
    console.log('📊 Getting real-time Plex server resource usage...');
    
    const resources = await getPlexServerResources();
    
    res.json({
      success: true,
      resources: resources,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error getting Plex server resources:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get server resources',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Sync Plex user activity (manual trigger)
router.post('/sync-user-activity', async (req, res) => {
  try {
    console.log('🔄 Starting Plex user activity sync...');
    const result = await syncPlexUserActivity();
    res.json(result);
  } catch (error) {
    console.error('❌ Error syncing Plex user activity:', error);
    res.status(500).json({ error: 'Failed to sync user activity' });
  }
});

// Start async sync
router.post('/sync-user-activity-async', async (req, res) => {
  try {
// Check if sync is already running
const runningSyncs = await db.query(
  "SELECT * FROM plex_sync_status WHERE sync_type = 'user_activity' AND status = 'running'"
);

if (runningSyncs.length > 0) {
      return res.json({ 
        success: false, 
        message: 'Activity sync already in progress',
        started_at: runningSyncs[0].started_at
      });
    }
    
// Create sync status record
const syncRecord = await db.query(
  "INSERT INTO plex_sync_status (sync_type, status) VALUES ('user_activity', 'running')"
);
const syncId = syncRecord.insertId;
    
    console.log(`🔄 Starting async Plex user activity sync (ID: ${syncId})...`);
    
    // Respond immediately
    res.json({ 
      success: true, 
      message: 'Activity sync started in background',
      syncId: syncId,
      timestamp: new Date().toISOString(),
      estimatedDuration: '10-30 minutes'
    });
    
    // Run sync in background (don't await)
    syncPlexUserActivityWithStatus(syncId)
      .then(result => {
        console.log(`✅ Background sync ${syncId} completed:`, result);
      })
      .catch(error => {
        console.error(`❌ Background sync ${syncId} failed:`, error);
      });
    
  } catch (error) {
    console.error('❌ Error starting async sync:', error);
    res.status(500).json({ error: 'Failed to start sync' });
  }
});

// Get sync status
router.get('/sync-status/:syncId?', async (req, res) => {
  try {
    const { syncId } = req.params;
    
    let query, params;
    if (syncId) {
      query = "SELECT * FROM plex_sync_status WHERE id = ?";
      params = [syncId];
    } else {
      // Get latest sync status
      query = "SELECT * FROM plex_sync_status WHERE sync_type = 'user_activity' ORDER BY started_at DESC LIMIT 1";
      params = [];
    }
    
const syncStatus = await db.query(query, params);

if (syncStatus.length === 0) {
      return res.json({ success: false, message: 'No sync found' });
    }
    
    const status = syncStatus[0];
    const response = {
      success: true,
      syncId: status.id,
      status: status.status,
      started_at: status.started_at,
      completed_at: status.completed_at,
      records_processed: status.records_processed,
      error_message: status.error_message
    };
    
    // Calculate duration if completed
    if (status.completed_at) {
      const duration = new Date(status.completed_at) - new Date(status.started_at);
      response.duration_seconds = Math.round(duration / 1000);
      response.duration_minutes = Math.round(duration / 60000);
    } else if (status.status === 'running') {
      const elapsed = new Date() - new Date(status.started_at);
      response.elapsed_seconds = Math.round(elapsed / 1000);
      response.elapsed_minutes = Math.round(elapsed / 60000);
    }
    
    res.json(response);
    
  } catch (error) {
    console.error('❌ Error getting sync status:', error);
    res.status(500).json({ error: 'Failed to get sync status' });
  }
});

router.post('/cancel-sync', async (req, res) => {
  try {
    const result = await db.query(`
      UPDATE plex_sync_status 
      SET status = 'cancelled', completed_at = NOW(), error_message = 'Manually cancelled'
      WHERE sync_type = 'user_activity' AND status = 'running'
    `);
    
    res.json({ 
      success: true, 
      message: `Cancelled ${result.affectedRows} running sync(s)`,
      cancelled_count: result.affectedRows
    });
  } catch (error) {
    console.error('Error cancelling sync:', error);
    res.status(500).json({ error: 'Failed to cancel sync' });
  }
});

// POST /api/plex/refresh-resources - Force refresh server resources
router.post('/refresh-resources', async (req, res) => {
  try {
    console.log('🔄 Force refreshing Plex server resources...');
    
    const resources = await getPlexServerResources();
    
    // Cache the results
    await cacheServerResources(resources);
    
    const formattedResources = formatDashboardResourcesFromLive(resources);
    
    res.json({
      success: true,
      message: 'Plex server resources refreshed successfully',
      resources: formattedResources,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error refreshing Plex resources:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh server resources',
      message: error.message
    });
  }
});

// Helper function to get live server resources using Python
async function getPlexServerResources() {
  return new Promise((resolve, reject) => {
    console.log('🐍 Executing Python script for Plex server resources...');
    
    const python = spawn('python3', ['plex_resource_monitor.py'], {
      cwd: __dirname,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let dataString = '';
    let errorString = '';
    
    python.stdout.on('data', (data) => {
      dataString += data.toString();
    });
    
    python.stderr.on('data', (data) => {
      errorString += data.toString();
      console.log('🐍 Python resource debug:', data.toString().trim());
    });
    
    python.on('close', async (code) => {
      if (code !== 0) {
        console.error('❌ Python resource script failed:', errorString);
        reject(new Error(`Python resource script failed: ${errorString}`));
        return;
      }
      
      try {
        const resources = JSON.parse(dataString);
        console.log('📊 Parsed server resources from Python');
        resolve(resources);
        
      } catch (parseError) {
        console.error('❌ Error parsing Python resource output:', parseError);
        reject(parseError);
      }
    });
    
    python.on('error', (err) => {
      console.error('❌ Failed to spawn Python process for resources:', err);
      reject(err);
    });
  });
}

// Helper function to refresh and cache server resources
async function refreshPlexServerResources() {
  try {
    const resources = await getPlexServerResources();
    await cacheServerResources(resources);
    console.log('✅ Server resources refreshed and cached');
    return resources;
  } catch (error) {
    console.error('❌ Error refreshing server resources:', error);
    throw error;
  }
}

// Helper function to cache server resources in database
async function cacheServerResources(resources) {
  try {
    // Clear old resource data
    await db.query('DELETE FROM plex_server_resources');
    
    // Insert new resource data
    for (const [serverGroup, servers] of Object.entries(resources)) {
      for (const [serverType, resourceData] of Object.entries(servers)) {
await db.query(`
  INSERT INTO plex_server_resources (server_group, server_type, resource_data, last_updated) 
  VALUES (?, ?, ?, NOW())
  ON DUPLICATE KEY UPDATE 
    resource_data = VALUES(resource_data),
    last_updated = NOW()
`, [serverGroup, serverType, JSON.stringify(resourceData)]);
      }
    }
    
    console.log('✅ Server resources cached in database');
  } catch (error) {
    console.error('❌ Error caching server resources:', error);
    throw error;
  }
}

// Helper function to format resources for dashboard display
function formatDashboardResources(cachedResources) {
	 console.log('🔍 DEBUG: formatDashboardResources called with:', cachedResources);
  const defaultResource = {
    serverName: 'Unknown',
    status: 'unknown',
    cpuUsage: 0,
    memoryUsage: 0,
    activeSessions: 0,
    transcodingSessions: 0,
    directPlaySessions: 0,
    libraryCount: 0,
    serverVersion: 'Unknown',
    platform: 'Unknown',
    success: false
  };
  
  const formatted = {
    plex1: { regular: { ...defaultResource }, fourk: { ...defaultResource } },
    plex2: { regular: { ...defaultResource }, fourk: { ...defaultResource } },
    lastUpdate: 'No data'
  };
  
  if (cachedResources && cachedResources.length > 0) {
    formatted.lastUpdate = new Date(cachedResources[0].last_updated).toLocaleString();
    
    cachedResources.forEach(row => {
      try {
        const resourceData = row.resource_data;
        const serverGroup = row.server_group;
        const serverType = row.server_type;
        
        if (formatted[serverGroup] && formatted[serverGroup][serverType]) {
          formatted[serverGroup][serverType] = {
            serverName: resourceData.server_name || 'Unknown',
            status: resourceData.resources?.server_status || 'unknown',
            cpuUsage: resourceData.resources?.cpu_usage_percent || 0,
            memoryUsage: resourceData.resources?.memory_usage_percent || 0,
            activeSessions: resourceData.resources?.active_sessions || 0,
            transcodingSessions: resourceData.resources?.transcoding_sessions || 0,
            directPlaySessions: resourceData.resources?.direct_play_sessions || 0,
            libraryCount: resourceData.resources?.library_count || 0,
            serverVersion: resourceData.server_version || 'Unknown',
            platform: resourceData.platform || 'Unknown',
            success: resourceData.success || false
          };
        }
      } catch (error) {
        console.error('Error parsing cached resource data:', error);
      }
    });
  }
  
  return formatted;
}

// Helper function to format live resources for dashboard
function formatDashboardResourcesFromLive(resources) {
  const defaultResource = {
    serverName: 'Unknown',
    status: 'unknown',
    cpuUsage: 0,
    memoryUsage: 0,
    activeSessions: 0,
    transcodingSessions: 0,
    directPlaySessions: 0,
    libraryCount: 0,
    serverVersion: 'Unknown',
    platform: 'Unknown',
    success: false
  };
  
  const formatted = {
    plex1: { regular: { ...defaultResource }, fourk: { ...defaultResource } },
    plex2: { regular: { ...defaultResource }, fourk: { ...defaultResource } },
    lastUpdate: new Date().toLocaleString()
  };
  
  for (const [serverGroup, servers] of Object.entries(resources)) {
    for (const [serverType, resourceData] of Object.entries(servers)) {
      if (formatted[serverGroup] && formatted[serverGroup][serverType]) {
        formatted[serverGroup][serverType] = {
          serverName: resourceData.server_name || 'Unknown',
          status: resourceData.resources?.server_status || 'unknown',
          cpuUsage: resourceData.resources?.cpu_usage_percent || 0,
          memoryUsage: resourceData.resources?.memory_usage_percent || 0,
          activeSessions: resourceData.resources?.active_sessions || 0,
          transcodingSessions: resourceData.resources?.transcoding_sessions || 0,
          directPlaySessions: resourceData.resources?.direct_play_sessions || 0,
          libraryCount: resourceData.resources?.library_count || 0,
          serverVersion: resourceData.server_version || 'Unknown',
          platform: resourceData.platform || 'Unknown',
          success: resourceData.success || false
        };
      }
    }
  }
  
  return formatted;
}

// Helper function to get default resource data
function getDefaultResourceData() {
  const defaultServer = {
    serverName: 'Unknown',
    status: 'unknown',
    cpuUsage: 0,
    memoryUsage: 0,
    activeSessions: 0,
    transcodingSessions: 0,
    directPlaySessions: 0,
    libraryCount: 0,
    serverVersion: 'Unknown',
    platform: 'Unknown',
    success: false
  };
  
  return {
    plex1: { 
      regular: { ...defaultServer },
      fourk: { ...defaultServer }
    },
    plex2: { 
      regular: { ...defaultServer },
      fourk: { ...defaultServer }
    },
    lastUpdate: 'No data'
  };
}

// Helper function to refresh Plex statistics
async function refreshPlexStats() {
  return new Promise((resolve, reject) => {
    console.log('🔄 Executing Python script for fresh Plex stats...');
    
    const python = spawn('python3', ['plex_statistics.py'], {
      cwd: __dirname,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let dataString = '';
    let errorString = '';
    
    python.stdout.on('data', (data) => {
      dataString += data.toString();
    });
    
    python.stderr.on('data', (data) => {
      errorString += data.toString();
    });
    
    python.on('close', async (code) => {
      if (code !== 0) {
        console.error('❌ Python script failed:', errorString);
        reject(new Error(`Python script failed: ${errorString}`));
        return;
      }
      
      try {
        const rawStats = JSON.parse(dataString);
        console.log('📊 Raw stats from Python:', rawStats);
        
        // Extract stats from Plex 1 servers only
        const plex1Regular = rawStats.plex1?.regular?.stats || {};
        const plex1Fourk = rawStats.plex1?.fourk?.stats || {};
        
        // Store in database
const statsToStore = [
  ['hd_movies', plex1Regular.hd_movies || 0],
  ['anime_movies', plex1Regular.anime_movies || 0],
  ['fourk_movies', plex1Fourk.hd_movies || 0], // 4K movies from 4K server
  ['tv_shows', (plex1Regular.regular_tv_shows || 0) + (plex1Regular.kids_tv_shows || 0) + (plex1Regular.fitness_tv_shows || 0)], // Combine non-anime shows
  ['anime_tv_shows', plex1Regular.anime_tv_shows || 0], // Separate anime TV
  ['tv_seasons', plex1Regular.total_seasons || 0],
  ['tv_episodes', plex1Regular.total_episodes || 0],
  ['audiobooks', plex1Regular.audio_albums || 0]
];
        
        // Clear old stats and insert new ones
await db.query('DELETE FROM plex_statistics WHERE stat_key IN (?, ?, ?, ?, ?, ?, ?, ?)', 
  ['hd_movies', 'anime_movies', 'fourk_movies', 'tv_shows', 'anime_tv_shows', 'tv_seasons', 'tv_episodes', 'audiobooks']);
        
        for (const [key, value] of statsToStore) {
          await db.query(
            `INSERT INTO plex_statistics (stat_key, stat_value, last_updated) VALUES (?, ?, NOW())`,
            [key, value]
          );
        }
        
        console.log('✅ Plex statistics cached in database');
        resolve();
        
      } catch (parseError) {
        console.error('❌ Error parsing Python output:', parseError);
        reject(parseError);
      }
    });
    
    python.on('error', (err) => {
      console.error('❌ Failed to spawn Python process:', err);
      reject(err);
    });
  });
}

// In routes-plex.js, update the syncPlexUserActivity function:

async function syncPlexUserActivity() {
  return new Promise((resolve, reject) => {
    console.log('🔄 Executing Python script for Plex user activity...');
    
    // UPDATED: Use new script name and parameters
    const python = spawn('python3', ['plex_last_watched_script.py', '--format', 'json'], {
      cwd: __dirname,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let dataString = '';
    let errorString = '';
    
    python.stdout.on('data', (data) => {
      dataString += data.toString();
    });
    
    python.stderr.on('data', (data) => {
      errorString += data.toString();
    });
    
    python.on('close', async (code) => {
      if (code !== 0) {
        console.error('❌ Python activity script failed:', errorString);
        reject(new Error(`Python script failed: ${errorString}`));
        return;
      }
      
      try {
        const activityData = JSON.parse(dataString);
        console.log(`📊 Processing ${activityData.length} user activity records`);
        
        // Clear old data and insert new
        await db.query('DELETE FROM plex_user_activity');
        
for (const record of activityData) {
  // Find the user in our database to check their tags
  const [user] = await db.query(`
    SELECT id, name, tags FROM users 
    WHERE plex_email = ? OR plex_username = ?
  `, [record.email, record.username]);
  
  if (!user) {
    console.log(`⚠️ No user found for ${record.email}/${record.username}, skipping...`);
    continue;
  }
  
  // Add this debug code right after finding the user
console.log(`🔍 Raw tags for ${user.name}:`, user.tags);
console.log(`🔍 Tags type:`, typeof user.tags);
console.log(`🔍 Tags length:`, user.tags ? user.tags.length : 'null');
  
  // Parse user tags
let userTags = [];
try {
  if (user.tags === null || user.tags === undefined) {
    userTags = [];
  } else if (Array.isArray(user.tags)) {
    // Already parsed by MySQL
    userTags = user.tags;
  } else if (typeof user.tags === 'string') {
    // String that needs parsing
    userTags = JSON.parse(user.tags);
  } else {
    console.log(`⚠️ Unexpected tags type for ${user.name}:`, typeof user.tags);
    userTags = [];
  }
  
  console.log(`🏷️ Parsed tags for ${user.name}:`, userTags);
  
} catch (e) {
  console.log(`❌ Error parsing tags for ${user.name}:`, e.message);
  console.log(`🔍 Raw value was:`, user.tags);
  userTags = [];
}
  
  // Check if this server record should be saved for this user
  const serverName = record.server;
  const hasPlex1Tag = userTags.includes('Plex 1');
  const hasPlex2Tag = userTags.includes('Plex 2');
  const hasNoPlexTags = !hasPlex1Tag && !hasPlex2Tag;
  
  let shouldSave = false;
  
  if (serverName.includes('Plex 1') && hasPlex1Tag) {
    shouldSave = true;
  } else if (serverName.includes('Plex 2') && hasPlex2Tag) {
    shouldSave = true;
  } else if (hasNoPlexTags) {
    shouldSave = true; // Users with no Plex tags get data from any server
  }
  
  if (!shouldSave) {
    console.log(`🚫 Skipping ${serverName} activity for ${user.name} (has tags: ${userTags.join(', ')})`);
    continue;
  }
  
  console.log(`✅ Saving ${serverName} activity for ${user.name} (${record.days_since_last_watch} days ago)`);
  
  await db.query(`
    INSERT INTO plex_user_activity 
    (plex_account_id, plex_account_name, plex_account_username, plex_account_email,
     server_name, days_since_last_watch, last_watched_date, last_watched_title, 
     has_recent_activity, sync_timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    record.plex_account_id,
    record.username,
    record.username,
    record.email,
    record.server,
    record.days_since_last_watch,
    record.last_watched_date,
    record.last_watched_title,
    record.days_since_last_watch !== null,
    record.sync_timestamp
  ]);
}
        
        console.log('✅ Plex user activity synced to database');
        resolve();
        
      } catch (parseError) {
        console.error('❌ Error parsing Python output:', parseError);
        reject(parseError);
      }
    });
    
    python.on('error', (err) => {
      console.error('❌ Failed to spawn Python process:', err);
      reject(err);
    });
  });
}

async function syncPlexUserActivityWithStatus(syncId) {
  try {
    console.log(`🔄 Starting tracked sync ${syncId}...`);
    
    const result = await new Promise((resolve, reject) => {
      // UPDATED: Use new script name (no --days parameter needed since it gets all history)
      const python = spawn('python3', ['plex_last_watched_script.py', '--format', 'json'], {
        cwd: __dirname,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let dataString = '';
      let errorString = '';
      
      python.stdout.on('data', (data) => {
        dataString += data.toString();
      });
      
      python.stderr.on('data', (data) => {
        errorString += data.toString();
        console.log(`🐍 Sync ${syncId} progress:`, data.toString().trim());
      });
      
      python.on('close', async (code) => {
        if (code !== 0) {
          reject(new Error(`Python script failed with code ${code}: ${errorString}`));
          return;
        }
        
        try {
          const activityData = JSON.parse(dataString);
          console.log(`📊 Sync ${syncId}: Processing ${activityData.length} records`);
          
          // Clear old data and insert new
          await db.query('DELETE FROM plex_user_activity');
          
for (const record of activityData) {
  // Find the user in our database to check their tags
  const [user] = await db.query(`
    SELECT id, name, tags FROM users 
    WHERE plex_email = ? OR plex_username = ?
  `, [record.email, record.username]);
  
  if (!user) {
    console.log(`⚠️ No user found for ${record.email}/${record.username}, skipping...`);
    continue;
  }
  // Add this debug code right after finding the user
console.log(`🔍 Raw tags for ${user.name}:`, user.tags);
console.log(`🔍 Tags type:`, typeof user.tags);
console.log(`🔍 Tags length:`, user.tags ? user.tags.length : 'null');
  // Parse user tags

let userTags = [];
try {
  if (user.tags === null || user.tags === undefined) {
    userTags = [];
  } else if (Array.isArray(user.tags)) {
    // Already parsed by MySQL
    userTags = user.tags;
  } else if (typeof user.tags === 'string') {
    // String that needs parsing
    userTags = JSON.parse(user.tags);
  } else {
    console.log(`⚠️ Unexpected tags type for ${user.name}:`, typeof user.tags);
    userTags = [];
  }
  
  console.log(`🏷️ Parsed tags for ${user.name}:`, userTags);
  
} catch (e) {
  console.log(`❌ Error parsing tags for ${user.name}:`, e.message);
  console.log(`🔍 Raw value was:`, user.tags);
  userTags = [];
}
  
  // Check if this server record should be saved for this user
  const serverName = record.server;
  const hasPlex1Tag = userTags.includes('Plex 1');
  const hasPlex2Tag = userTags.includes('Plex 2');
  const hasNoPlexTags = !hasPlex1Tag && !hasPlex2Tag;
  
  let shouldSave = false;
  
  if (serverName.includes('Plex 1') && hasPlex1Tag) {
    shouldSave = true;
  } else if (serverName.includes('Plex 2') && hasPlex2Tag) {
    shouldSave = true;
  } else if (hasNoPlexTags) {
    shouldSave = true; // Users with no Plex tags get data from any server
  }
  
  if (!shouldSave) {
    console.log(`🚫 Skipping ${serverName} activity for ${user.name} (has tags: ${userTags.join(', ')})`);
    continue;
  }
  
  console.log(`✅ Saving ${serverName} activity for ${user.name} (${record.days_since_last_watch} days ago)`);
  
  await db.query(`
    INSERT INTO plex_user_activity 
    (plex_account_id, plex_account_name, plex_account_username, plex_account_email,
     server_name, days_since_last_watch, last_watched_date, last_watched_title, 
     has_recent_activity, sync_timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    record.plex_account_id,
    record.username,
    record.username,
    record.email,
    record.server,
    record.days_since_last_watch,
    record.last_watched_date,
    record.last_watched_title,
    record.days_since_last_watch !== null,
    record.sync_timestamp
  ]);
}
          
          resolve({
            success: true,
            recordsProcessed: activityData.length
          });
          
        } catch (parseError) {
          reject(parseError);
        }
      });
      
      python.on('error', (err) => {
        reject(err);
      });
    });
    
    // Update status as completed
    await db.query(
      "UPDATE plex_sync_status SET status = 'completed', completed_at = NOW(), records_processed = ? WHERE id = ?",
      [result.recordsProcessed, syncId]
    );
    
    console.log(`✅ Sync ${syncId} completed successfully`);
    return result;
    
  } catch (error) {
    console.error(`❌ Sync ${syncId} failed:`, error);
    
    // Update status as failed
    await db.query(
      "UPDATE plex_sync_status SET status = 'failed', completed_at = NOW(), error_message = ? WHERE id = ?",
      [error.message, syncId]
    );
    
    throw error;
  }
}

// Helper function to build stats response
function buildStatsResponse(dbRows) {
  const stats = {
    hdMovies: 0,
    animeMovies: 0,
    fourkMovies: 0,
    tvShows: 0,
    animeTVShows: 0,  // NEW
    tvSeasons: 0,
    tvEpisodes: 0,
    audioBooks: 0,
    lastUpdate: new Date().toLocaleDateString()
  };
  
  // FIX: Handle undefined or non-array dbRows
  if (!dbRows || !Array.isArray(dbRows)) {
    console.warn('⚠️ buildStatsResponse received invalid data:', dbRows);
    return stats;
  }
  
  for (const row of dbRows) {
    switch (row.stat_key) {
      case 'hd_movies':
        stats.hdMovies = parseInt(row.stat_value);
        break;
      case 'anime_movies':
        stats.animeMovies = parseInt(row.stat_value);
        break;
      case 'fourk_movies':
        stats.fourkMovies = parseInt(row.stat_value);
        break;
      case 'tv_shows':
        stats.tvShows = parseInt(row.stat_value);
        break;
      case 'anime_tv_shows':  // NEW
        stats.animeTVShows = parseInt(row.stat_value);
        break;
      case 'tv_seasons':
        stats.tvSeasons = parseInt(row.stat_value);
        break;
      case 'tv_episodes':
        stats.tvEpisodes = parseInt(row.stat_value);
        break;
      case 'audiobooks':
        stats.audioBooks = parseInt(row.stat_value);
        break;
    }
  }
  
  return stats;
}

module.exports = router;