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

// Share libraries with user (original endpoint)
router.post('/share', async (req, res) => {
  try {
    const { userEmail, serverGroup, libraries } = req.body;
    
    if (!userEmail || !serverGroup || !libraries) {
      return res.status(400).json({ error: 'Missing required fields: userEmail, serverGroup, libraries' });
    }
    
    if (!['plex1', 'plex2'].includes(serverGroup)) {
      return res.status(400).json({ error: 'Invalid server group. Use plex1 or plex2' });
    }
    
    console.log(`🤝 API: Basic sharing request for ${userEmail} on ${serverGroup}`);
    
    const result = await plexService.shareLibrariesWithUser(userEmail, serverGroup, libraries);
    
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

// Enhanced sharing endpoint with intelligent conflict detection
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
        console.log(`ℹ️ No libraries specified for ${serverGroup}, skipping`);
        results[serverGroup] = {
          success: true,
          message: 'No libraries to share',
          action: 'skipped'
        };
        continue;
      }
      
      try {
        // Use enhanced sharing that detects conflicts and only shares new libraries
        const result = await plexService.shareLibrariesWithUserEnhanced(userEmail, serverGroup, libraries);
        results[serverGroup] = result;
        
        if (!result.success) {
          errors.push(`${serverGroup}: ${result.error}`);
        } else {
          console.log(`✅ ${serverGroup} sharing completed successfully`);
          
          // Count actual changes made
          const addedCount = (result.addedLibraries?.regular?.length || 0) + (result.addedLibraries?.fourk?.length || 0);
          const removedCount = (result.removedLibraries?.regular?.length || 0) + (result.removedLibraries?.fourk?.length || 0);
          totalChanges += addedCount + removedCount;
          
          if (addedCount > 0) {
            console.log(`   ➕ Added ${addedCount} libraries`);
          }
          if (removedCount > 0) {
            console.log(`   ➖ Removed ${removedCount} libraries`);
          }
        }
      } catch (error) {
        console.error(`❌ Error sharing ${serverGroup}:`, error);
        results[serverGroup] = { success: false, error: error.message };
        errors.push(`${serverGroup}: ${error.message}`);
      }
    }
    
    // Determine overall success
    const overallSuccess = errors.length === 0;
    const hasActions = Object.values(results).some(r => r.action !== 'skipped');
    
    let message = 'Library sharing process completed';
    if (!hasActions) {
      message = 'No library changes were needed';
    } else if (!overallSuccess) {
      message = 'Some library sharing operations had issues';
    } else if (totalChanges === 0) {
      message = 'User already had the correct library access - no changes needed';
    } else {
      message = `Library access updated successfully (${totalChanges} changes detected - Note: Actual Plex API sharing not yet implemented)`;
    }
    
    console.log(`📊 Overall result: ${overallSuccess ? 'SUCCESS' : 'PARTIAL FAILURE'}`);
    console.log(`📊 Total changes detected: ${totalChanges}`);
    console.log(`📋 Results:`, results);
    
    res.json({
      success: overallSuccess,
      message: message,
      isNewUser: isNewUser,
      previousAccess: currentAccess,
      results: results,
      errors: errors.length > 0 ? errors : undefined,
      totalChanges: totalChanges,
      note: 'This is using the Node.js implementation. Actual Plex sharing API calls need to be implemented.'
    });
    
  } catch (error) {
    console.error('❌ Error in comprehensive sharing:', error);
    res.status(500).json({ error: 'Failed to share user libraries' });
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

module.exports = router;