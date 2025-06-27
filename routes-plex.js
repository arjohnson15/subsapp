const express = require('express');
const plexService = require('./plex-service');
const db = require('./database-config');
const router = express.Router();

// Get libraries for a server group (plex1 or plex2)
router.get('/libraries/:serverGroup', async (req, res) => {
  try {
    const { serverGroup } = req.params;
    
    if (!['plex1', 'plex2'].includes(serverGroup)) {
      return res.status(400).json({ error: 'Invalid server group. Use plex1 or plex2' });
    }
    
    const libraries = await plexService.getLibrariesForGroup(serverGroup);
    res.json(libraries);
  } catch (error) {
    console.error('Error fetching libraries:', error);
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

// ENHANCED: Comprehensive user library sharing endpoint
router.post('/share-user-libraries', async (req, res) => {
  try {
    const { userEmail, plexLibraries, isNewUser = false } = req.body;
    
    if (!userEmail || !plexLibraries) {
      return res.status(400).json({ 
        error: 'Missing required fields: userEmail, plexLibraries' 
      });
    }
    
    console.log(`🔧 API: Enhanced sharing for ${userEmail} (new user: ${isNewUser})`);
    console.log(`📋 Requested libraries:`, plexLibraries);
    
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
        console.log(`ℹ️ No libraries specified for ${serverGroup}, clearing access`);
        
        // Clear access if user currently has any
        const currentGroupAccess = currentAccess[serverGroup];
        const hasCurrentAccess = currentGroupAccess && 
          ((currentGroupAccess.regular && currentGroupAccess.regular.length > 0) ||
           (currentGroupAccess.fourk && currentGroupAccess.fourk.length > 0));
        
        if (hasCurrentAccess) {
          // Need to clear access
          const clearResult = await plexService.shareLibrariesWithUserEnhanced(
            userEmail, 
            serverGroup, 
            { regular: [], fourk: [] }
          );
          
          results[serverGroup] = clearResult;
          if (clearResult.changes > 0) {
            totalChanges += clearResult.changes;
            actualApiCalls += clearResult.changes;
          }
        } else {
          results[serverGroup] = {
            success: true,
            message: 'No libraries to share and none currently shared',
            action: 'skipped',
            changes: 0
          };
        }
        continue;
      }
      
      try {
        // Use enhanced sharing with real API calls
        console.log(`🤝 Processing ${serverGroup} with enhanced sharing...`);
        const result = await plexService.shareLibrariesWithUserEnhanced(userEmail, serverGroup, libraries);
        results[serverGroup] = result;
        
        if (!result.success) {
          errors.push(`${serverGroup}: ${result.error}`);
        } else {
          console.log(`✅ ${serverGroup} sharing completed successfully`);
          
          // Count actual changes made
          const changes = result.changes || 0;
          totalChanges += changes;
          
          if (changes > 0) {
            actualApiCalls += changes;
            console.log(`   🔄 Made ${changes} API calls to Plex servers`);
          } else {
            console.log(`   ℹ️ No changes needed - user already has correct access`);
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
    console.log(`📋 Results:`, results);
    
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
    
    console.log(`🤝 API: Legacy sharing request for ${userEmail} on ${serverGroup}`);
    
    const result = await plexService.shareLibrariesWithUserEnhanced(userEmail, serverGroup, libraries);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('Error sharing libraries:', error);
    res.status(500).json({ error: 'Failed to share libraries' });
  }
});

// Remove user access
router.post('/remove-access', async (req, res) => {
  try {
    const { userEmail, serverGroups } = req.body;
    
    if (!userEmail || !serverGroups || !Array.isArray(serverGroups)) {
      return res.status(400).json({ error: 'Missing required fields: userEmail, serverGroups (array)' });
    }
    
    console.log(`🗑️ API: Remove access request for ${userEmail} from:`, serverGroups);
    
    const result = await plexService.removeUserAccess(userEmail, serverGroups);
    
    if (result.success) {
      // Update database to reflect removal
      const emptyAccess = { plex1: { regular: [], fourk: [] }, plex2: { regular: [], fourk: [] } };
      await plexService.updateUserLibraryAccessInDatabase(userEmail, emptyAccess);
      
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('Error removing user access:', error);
    res.status(500).json({ error: 'Failed to remove user access' });
  }
});

// Test connection to server group
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
    console.log(`🐛 DEBUG: Enhanced check for ${email}`);
    
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
      SELECT id, name, email, plex_email, tags, plex_libraries
      FROM users 
      WHERE email = ? OR plex_email = ?
    `, [email, email]);
    
    // Get cached access using our method
    const cachedAccess = await plexService.getUserCurrentAccess(email);
    
    res.json({
      email: email,
      realTimeStatus: debugInfo,
      databaseUser: dbUser ? {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        plex_email: dbUser.plex_email,
        tags: JSON.parse(dbUser.tags || '[]'),
        stored_plex_libraries: JSON.parse(dbUser.plex_libraries || '{}')
      } : null,
      cachedAccess: cachedAccess,
      summary: {
        totalPlexLibraries: Object.values(debugInfo).reduce((total, group) => {
          return total + (group.regular?.libraries || 0) + (group.fourk?.libraries || 0);
        }, 0),
        hasAnyAccess: Object.values(debugInfo).some(group => 
          (group.regular?.found) || (group.fourk?.found)
        )
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
    
    console.log(`🧪 DEBUG: Testing library update for ${email} on ${serverGroup}`);
    console.log(`📋 Test libraries:`, libraries);
    
    // Get current access first
    const currentAccess = await plexService.getUserCurrentAccess(email);
    console.log(`📊 Current access:`, currentAccess);
    
    // Perform the update
    const result = await plexService.shareLibrariesWithUserEnhanced(email, serverGroup, libraries);
    
    // Get new access after update
    const newAccess = await plexService.getUserCurrentAccess(email);
    console.log(`📊 New access:`, newAccess);
    
    res.json({
      email: email,
      serverGroup: serverGroup,
      requestedLibraries: libraries,
      previousAccess: currentAccess,
      updateResult: result,
      newAccess: newAccess,
      accessChanged: JSON.stringify(currentAccess) !== JSON.stringify(newAccess),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error in test update:', error);
    res.status(500).json({ error: 'Failed to test update' });
  }
});

// Check invite status for a user across all Plex servers
router.get('/invite-status/:userEmail', async (req, res) => {
  try {
    const { userEmail } = req.params;
    
    if (!userEmail) {
      return res.status(400).json({ error: 'Missing userEmail parameter' });
    }
    
    console.log(`🔍 API: Checking invite status for ${userEmail}`);
    
    const pythonPlexService = require('../python-plex-wrapper');
    const result = await pythonPlexService.checkInviteStatus(userEmail);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('Error checking invite status:', error);
    res.status(500).json({ error: 'Failed to check invite status' });
  }
});

// Enhanced remove access with invite cancellation
router.post('/remove-access-enhanced', async (req, res) => {
  try {
    const { userEmail, serverGroups } = req.body;
    
    if (!userEmail || !serverGroups || !Array.isArray(serverGroups)) {
      return res.status(400).json({ error: 'Missing required fields: userEmail, serverGroups (array)' });
    }
    
    console.log(`🗑️ API: Enhanced removal for ${userEmail} from:`, serverGroups);
    
    const pythonPlexService = require('../python-plex-wrapper');
    const plexService = require('../plex-service');
    
    // First check current invite status
    const inviteStatus = await pythonPlexService.checkInviteStatus(userEmail);
    console.log(`🔍 Current invite status:`, inviteStatus);
    
    // Use enhanced complete removal
    const result = await pythonPlexService.removeUserCompletely(userEmail, serverGroups);
    
    if (result.success) {
      // Update database to reflect removal
      const emptyAccess = { plex1: { regular: [], fourk: [] }, plex2: { regular: [], fourk: [] } };
      await plexService.updateUserLibraryAccessInDatabase(userEmail, emptyAccess);
      
      console.log(`✅ Enhanced removal completed:`, result.summary);
      
      res.json({
        ...result,
        inviteStatus: inviteStatus,
        enhanced: true,
        message: `Enhanced removal completed - ${result.summary.invites_cancelled} invites cancelled, ${result.summary.users_removed} users removed from ${result.summary.servers_processed} servers`
      });
    } else {
      res.status(500).json({
        ...result,
        inviteStatus: inviteStatus
      });
    }
  } catch (error) {
    console.error('Error in enhanced user removal:', error);
    res.status(500).json({ error: 'Failed to remove user access' });
  }
});

// Get current user access with invite status
router.get('/user-access-with-status/:userEmail', async (req, res) => {
  try {
    const { userEmail } = req.params;
    
    if (!userEmail) {
      return res.status(400).json({ error: 'Missing userEmail parameter' });
    }
    
    console.log(`📋 API: Getting access and invite status for ${userEmail}`);
    
    const pythonPlexService = require('../python-plex-wrapper');
    const plexService = require('../plex-service');
    
    // Get current access
    const currentAccess = await plexService.getUserCurrentAccess(userEmail);
    
    // Get invite status
    const inviteStatus = await pythonPlexService.checkInviteStatus(userEmail);
    
    res.json({
      success: true,
      userEmail: userEmail,
      currentAccess: currentAccess,
      inviteStatus: inviteStatus,
      summary: {
        has_any_access: Object.values(currentAccess).some(serverAccess => 
          serverAccess.regular.length > 0 || serverAccess.fourk.length > 0
        ),
        has_pending_invites: inviteStatus.summary?.has_pending_invites || false,
        total_libraries: Object.values(currentAccess).reduce((total, serverAccess) => 
          total + serverAccess.regular.length + serverAccess.fourk.length, 0
        )
      }
    });
    
  } catch (error) {
    console.error('Error getting user access with status:', error);
    res.status(500).json({ error: 'Failed to get user access and invite status' });
  }
});

module.exports = router;