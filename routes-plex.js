const express = require('express');
const plexService = require('./plex-service');
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

// DEBUG: Check user's current Plex status across all servers
router.get('/debug/user/:email', async (req, res) => {
  try {
    const { email } = req.params;
    console.log(`🐛 DEBUG: Comprehensive user check for ${email}`);
    
    const serverConfigs = plexService.getServerConfig();
    const debugInfo = {};
    
    for (const [groupName, groupConfig] of Object.entries(serverConfigs)) {
      debugInfo[groupName] = {};
      
      try {
        // Check regular server
        const regularUsers = await plexService.getAllSharedUsersFromServer(groupConfig.regular);
        const regularUser = regularUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
        debugInfo[groupName].regular = {
          server: groupConfig.regular.name,
          found: !!regularUser,
          libraries: regularUser ? regularUser.libraries.length : 0,
          sharedServerId: regularUser ? regularUser.sharedServerId : null
        };
        
        // Check 4K server
        const fourkUsers = await plexService.getAllSharedUsersFromServer(groupConfig.fourk);
        const fourkUser = fourkUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
        debugInfo[groupName].fourk = {
          server: groupConfig.fourk.name,
          found: !!fourkUser,
          libraries: fourkUser ? fourkUser.libraries.length : 0,
          sharedServerId: fourkUser ? fourkUser.sharedServerId : null
        };
        
      } catch (error) {
        debugInfo[groupName].error = error.message;
      }
    }
    
    // Also get database info
    const dbAccess = await plexService.getUserCurrentAccess(email);
    
    res.json({
      email: email,
      plexServers: debugInfo,
      databaseAccess: dbAccess,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error in debug endpoint:', error);
    res.status(500).json({ error: 'Failed to get debug info' });
  }
});

module.exports = router;