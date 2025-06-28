const express = require('express');
const plexService = require('./plex-service');
const db = require('./database-config');
const router = express.Router();

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

module.exports = router;