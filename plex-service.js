const axios = require('axios');
const xml2js = require('xml2js');
const db = require('./database-config');
const pythonPlexService = require('./python-plex-wrapper');

class PlexService {
  constructor() {
    this.parser = new xml2js.Parser({ explicitArray: false });
    // FIXED: Don't call initializeSync immediately - let the app start first
    setTimeout(() => {
      this.initializeSync();
    }, 5000); // Wait 5 seconds for app to fully start
  }

  // Initialize periodic library sync
  initializeSync() {
    console.log('Starting Plex library sync service...');
    
    // FIXED: Don't sync immediately on startup - too risky
    // this.syncAllLibraries();
    
    // Set up hourly sync
    setInterval(() => {
      console.log('Running scheduled Plex library sync...');
      this.syncAllLibrariesSafely(); // Use safe version
    }, 60 * 60 * 1000); // 1 hour
    
    console.log('? Plex sync scheduled - will run every hour');
  }

  // FIXED: Safe version that won't crash the app
  async syncAllLibrariesSafely() {
    try {
      await this.syncAllLibraries();
    } catch (error) {
      console.error('? Scheduled Plex sync failed (non-fatal):', error.message);
      // Don't throw - just log and continue
    }
  }

  // Server configuration mapping (matches your existing config)
  getServerConfig() {
    return {
      'plex1': {
        regular: {
          name: 'Plex 1',
          serverId: '3ad72e19d4509a15d9f8253666a03efa78baac44',
          token: 'sxuautpKvoH2aZKG-j95',
          url: 'http://192.168.10.90:32400'
        },
        fourk: {
          name: 'Plex 1 4K',
          serverId: '90244d9a956da3afad32f85d6b24a9c24649d681',
          token: 'sxuautpKvoH2aZKG-j95',
          url: 'http://192.168.10.92:32400',
          // Hardcoded 4K libraries since they never change
          libraries: [{ id: '1', title: '4K Movies', type: 'movie' }]
        }
      },
      'plex2': {
        regular: {
          name: 'Plex 2',
          serverId: '3ad72e19d4509a15d9f8253666a03efa78baac44',
          token: 'B1QhFRA-Q2pSm15uxmMA',
          url: 'http://192.168.10.94:32400'
        },
        fourk: {
          name: 'Plex 2 4K',
          serverId: 'c6448117a95874f18274f31495ff5118fd291089',
          token: 'B1QhFRA-Q2pSm15uxmMA',
          url: 'http://192.168.10.92:32700',
          // Hardcoded 4K libraries since they never change
          libraries: [{ id: '1', title: '4K Movies', type: 'movie' }]
        }
      }
    };
  }

  // Make request to Plex.tv API (kept for reading operations)
  async makePlexTvRequest(serverId, token, endpoint) {
    try {
      const url = `https://plex.tv/api/servers/${serverId}${endpoint}`;
      console.log(`?? Plex.tv API request to: ${url}`);
      
      const response = await axios.get(url, {
        headers: {
          'X-Plex-Token': token,
          'Accept': 'application/xml'
        },
        timeout: 10000
      });
      
      return response.data;
    } catch (error) {
      console.error(`? Plex.tv API request failed for ${endpoint}:`, error.message);
      throw error;
    }
  }

  // FIXED: Get server libraries with better error handling and direct server fallback
  async getServerLibraries(serverConfig) {
    try {
      console.log(`?? Fetching libraries for ${serverConfig.name}...`);
      
      // OPTION 1: Try Plex.tv API first
      try {
        const xmlData = await this.makePlexTvRequest(serverConfig.serverId, serverConfig.token, '/sections');
        const result = await this.parser.parseStringPromise(xmlData);
        
        if (result && result.MediaContainer && result.MediaContainer.Directory) {
          let directories = result.MediaContainer.Directory;
          if (!Array.isArray(directories)) {
            directories = [directories];
          }
          
          const libraries = directories.map(dir => ({
            id: dir.$.key,
            title: dir.$.title,
            type: dir.$.type,
            agent: dir.$.agent || '',
            scanner: dir.$.scanner || '',
            language: dir.$.language || 'en'
          }));
          
          console.log(`? Found ${libraries.length} libraries via Plex.tv API for ${serverConfig.name}`);
          return libraries;
        }
      } catch (error) {
        console.log(`?? Plex.tv API failed for ${serverConfig.name}, trying direct server connection...`);
      }
      
      // OPTION 2: Try direct server connection as fallback
      try {
        const directUrl = `${serverConfig.url}/library/sections`;
        console.log(`?? Trying direct connection: ${directUrl}`);
        
        const response = await axios.get(directUrl, {
          headers: {
            'X-Plex-Token': serverConfig.token,
            'Accept': 'application/xml'
          },
          timeout: 15000
        });
        
        const result = await this.parser.parseStringPromise(response.data);
        
        if (result && result.MediaContainer && result.MediaContainer.Directory) {
          let directories = result.MediaContainer.Directory;
          if (!Array.isArray(directories)) {
            directories = [directories];
          }
          
          const libraries = directories.map(dir => ({
            id: dir.$.key,
            title: dir.$.title,
            type: dir.$.type,
            agent: dir.$.agent || '',
            scanner: dir.$.scanner || '',
            language: dir.$.language || 'en'
          }));
          
          console.log(`? Found ${libraries.length} libraries via direct connection for ${serverConfig.name}`);
          return libraries;
        }
      } catch (error) {
        console.log(`?? Direct server connection also failed for ${serverConfig.name}: ${error.message}`);
      }
      
      // OPTION 3: Return hardcoded fallback libraries
      console.log(`?? Both API methods failed, using hardcoded fallback libraries for ${serverConfig.name}`);
      return [
        { id: '1', title: 'Movies', type: 'movie' },
        { id: '2', title: 'TV Shows', type: 'show' },
        { id: '3', title: 'Music', type: 'artist' }
      ];
      
    } catch (error) {
      console.error(`? Error fetching libraries for ${serverConfig.name}:`, error.message);
      // Return empty array rather than throwing
      return [];
    }
  }

  // COMPLETELY FIXED: Get libraries from database OR fetch from API if database is empty
  async getLibrariesForGroup(serverGroup) {
    try {
      const serverConfigs = this.getServerConfig();
      const config = serverConfigs[serverGroup];
      
      if (!config) {
        throw new Error(`Invalid server group: ${serverGroup}`);
      }

      console.log(`?? Getting libraries for ${serverGroup}...`);

      // Try to get from database first
      const [regularLibsSetting] = await db.query(
        'SELECT setting_value FROM settings WHERE setting_key = ?',
        [`plex_libraries_${serverGroup}_regular`]
      );

      const [fourkLibsSetting] = await db.query(
        'SELECT setting_value FROM settings WHERE setting_key = ?',
        [`plex_libraries_${serverGroup}_fourk`]
      );

      let regularLibs = [];
      let fourkLibs = config.fourk.libraries || [{ id: '1', title: '4K Movies', type: 'movie' }];

      // Parse regular libraries from database
      if (regularLibsSetting && regularLibsSetting.setting_value) {
        try {
          regularLibs = JSON.parse(regularLibsSetting.setting_value);
          console.log(`?? Found ${regularLibs.length} regular libraries in database for ${serverGroup}`);
        } catch (parseError) {
          console.log(`?? Could not parse regular libraries from database for ${serverGroup}`);
          regularLibs = [];
        }
      }

      // Parse 4K libraries from database (but fall back to hardcoded)
      if (fourkLibsSetting && fourkLibsSetting.setting_value) {
        try {
          const parsedFourkLibs = JSON.parse(fourkLibsSetting.setting_value);
          if (parsedFourkLibs && parsedFourkLibs.length > 0) {
            fourkLibs = parsedFourkLibs;
            console.log(`?? Found ${fourkLibs.length} 4K libraries in database for ${serverGroup}`);
          }
        } catch (parseError) {
          console.log(`?? Could not parse 4K libraries from database for ${serverGroup}, using hardcoded`);
        }
      }

      // FIXED: If no regular libraries in database, try to fetch from API
      if (!regularLibs || regularLibs.length === 0) {
        console.log(`?? No regular libraries in database for ${serverGroup}, trying to fetch from API...`);
        try {
          regularLibs = await this.getServerLibraries(config.regular);
          
          // Store in database for next time
          if (regularLibs && regularLibs.length > 0) {
            await this.updateLibrariesInDatabase(serverGroup, 'regular', regularLibs);
            console.log(`? Fetched and stored ${regularLibs.length} regular libraries for ${serverGroup}`);
          }
        } catch (error) {
          console.error(`? Failed to fetch libraries from API for ${serverGroup}:`, error.message);
          // Use fallback libraries
          regularLibs = [
            { id: '1', title: 'Movies', type: 'movie' },
            { id: '2', title: 'TV Shows', type: 'show' },
            { id: '3', title: 'Music', type: 'artist' }
          ];
          console.log(`?? Using fallback libraries for ${serverGroup}`);
        }
      }

      const result = {
        regular: regularLibs || [],
        fourk: fourkLibs || [],
        serverNames: {
          regular: config.regular.name,
          fourk: config.fourk.name
        }
      };

      console.log(`? Returning ${result.regular.length} regular + ${result.fourk.length} 4K libraries for ${serverGroup}`);
      return result;
      
    } catch (error) {
      console.error(`? Error getting libraries for group ${serverGroup}:`, error.message);
      
      // FIXED: Return a safe fallback instead of throwing
      const serverConfigs = this.getServerConfig();
      const config = serverConfigs[serverGroup];
      
      return {
        regular: [
          { id: '1', title: 'Movies', type: 'movie' },
          { id: '2', title: 'TV Shows', type: 'show' }
        ],
        fourk: config?.fourk?.libraries || [{ id: '1', title: '4K Movies', type: 'movie' }],
        serverNames: {
          regular: config?.regular?.name || `${serverGroup} Regular`,
          fourk: config?.fourk?.name || `${serverGroup} 4K`
        }
      };
    }
  }

  // Test server connection (kept)
  async testConnection(serverGroup) {
    try {
      const serverConfigs = this.getServerConfig();
      const config = serverConfigs[serverGroup];
      
      if (!config) {
        throw new Error(`Invalid server group: ${serverGroup}`);
      }

      await this.makePlexTvRequest(config.regular.serverId, config.regular.token, '');
      console.log(`? Regular server connection successful: ${config.regular.name}`);

      await this.makePlexTvRequest(config.fourk.serverId, config.fourk.token, '');
      console.log(`? 4K server connection successful: ${config.fourk.name}`);

      return { 
        success: true, 
        message: `Both servers for ${serverGroup} are accessible`,
        regular: config.regular.name,
        fourk: config.fourk.name
      };
    } catch (error) {
      console.error(`? Connection test failed for ${serverGroup}:`, error.message);
      throw error;
    }
  }

// Get all shared users from a specific server using Plex.tv API
async getAllSharedUsersFromServer(serverConfig) {
  try {
    console.log(`📡 Getting shared users from ${serverConfig.name}...`);
    
    const url = `https://plex.tv/api/servers/${serverConfig.serverId}/shared_servers`;
    const response = await axios.get(url, {
      headers: {
        'X-Plex-Token': serverConfig.token,
        'Accept': 'application/xml'
      },
      timeout: 15000
    });
    
    if (response.status !== 200) {
      console.log(`⚠️ No shared users found on ${serverConfig.name} (HTTP ${response.status})`);
      return [];
    }
    
    const result = await this.parser.parseStringPromise(response.data);
    const users = [];
    
    if (result && result.MediaContainer && result.MediaContainer.SharedServer) {
      let sharedServers = result.MediaContainer.SharedServer;
      if (!Array.isArray(sharedServers)) {
        sharedServers = [sharedServers];
      }
      
      for (const sharedServer of sharedServers) {
        if (sharedServer.$ && sharedServer.$.email) {
          const libraries = [];
          
          // Get shared library sections
          if (sharedServer.Section) {
            let sections = sharedServer.Section;
            if (!Array.isArray(sections)) {
              sections = [sections];
            }
            
            for (const section of sections) {
              if (section.$ && section.$.shared === '1') {
                libraries.push({
                  id: section.$.key,
                  title: section.$.title || 'Unknown Library'
                });
              }
            }
          }
          
          users.push({
            email: sharedServer.$.email,
            username: sharedServer.$.username || sharedServer.$.email,
            libraries: libraries
          });
        }
      }
    }
    
    console.log(`✅ Found ${users.length} shared users on ${serverConfig.name}`);
    return users;
    
  } catch (error) {
    console.error(`❌ Error getting shared users from ${serverConfig.name}:`, error.message);
    return [];
  }
}

  // Get user's current access across all servers using Python
  async getUserCurrentAccess(userEmail) {
    try {
      console.log(`?? Getting current access for: ${userEmail}`);
      
      const serverConfigs = this.getServerConfig();
      const result = {};
      
      for (const [groupName, groupConfig] of Object.entries(serverConfigs)) {
        const regularUsers = await this.getAllSharedUsersFromServer(groupConfig.regular);
        const fourkUsers = await this.getAllSharedUsersFromServer(groupConfig.fourk);
        
        const regularUser = regularUsers.find(user => 
          user.email.toLowerCase() === userEmail.toLowerCase()
        );
        const fourkUser = fourkUsers.find(user => 
          user.email.toLowerCase() === userEmail.toLowerCase()
        );
        
        result[groupName] = {
          regular: regularUser ? regularUser.libraries : [],
          fourk: fourkUser ? fourkUser.libraries : []
        };
      }
      
      console.log(`? Current access for ${userEmail}:`, result);
      return result;
    } catch (error) {
      console.error('Error getting user current access:', error);
      return {};
    }
  }

  // Share libraries using Python script
  async shareLibrariesWithUser(userEmail, serverGroup, libraries) {
    try {
      console.log(`?? Sharing libraries with ${userEmail} on ${serverGroup}`);
      console.log(`?? Libraries to share:`, libraries);
      
      const serverConfigs = this.getServerConfig();
      const config = serverConfigs[serverGroup];
      
      if (!config) {
        throw new Error(`Invalid server group: ${serverGroup}`);
      }

let results = {}; // CHANGED: const to let
      let totalChanges = 0;

// Use the Python wrapper's shareLibrariesWithUser method
// This handles both regular and 4K servers automatically
const result = await pythonPlexService.shareLibrariesWithUser(userEmail, serverGroup, libraries);

// Extract the detailed results
results = result.details || {};
totalChanges = result.changes_made || 0;

// Log the results for debugging
console.log(`?? Python sharing detailed results:`, result);

      return {
        success: totalChanges > 0,
        results: results,
        changes: totalChanges,
        serverGroup: serverGroup
      };
    } catch (error) {
      console.error('Error sharing libraries:', error);
      throw error;
    }
  }

  // Check user pending invites using Python
  async checkUserPendingInvites(userEmail) {
    try {
      console.log(`?? Checking pending invites for: ${userEmail}`);
      
      const result = await pythonPlexService.checkInviteStatus(userEmail);
      
      if (!result.success) {
        console.log(`?? Failed to check invites for ${userEmail}`);
        return null;
      }
      
      // Extract pending invites
      const pendingInvites = {};
      
      for (const [serverGroup, serverData] of Object.entries(result.servers)) {
        const groupPending = {};
        let hasAnyPending = false;
        
        for (const [serverType, serverInfo] of Object.entries(serverData)) {
          if (serverInfo.status === 'pending') {
            groupPending[serverType] = {
              status: 'pending',
              server: serverInfo.server_name
            };
            hasAnyPending = true;
          }
        }
        
        if (hasAnyPending) {
          pendingInvites[serverGroup] = groupPending;
        }
      }
      
      console.log(`?? Pending invites for ${userEmail}:`, Object.keys(pendingInvites).length > 0 ? pendingInvites : 'None');
      
      return Object.keys(pendingInvites).length > 0 ? pendingInvites : null;
    } catch (error) {
      console.error(`? Error checking pending invites for ${userEmail}:`, error);
      return null;
    }
  }

  // NEW: Sync pending invites for all users with Plex access
  async syncPendingInvites() {
    try {
      console.log('\n?? Starting pending invites sync...');
      
      // Get all users who have Plex library access or Plex email
      const users = await db.query(`
        SELECT id, name, email, plex_email, plex_libraries 
        FROM users 
        WHERE (plex_email IS NOT NULL AND plex_email != '') 
           OR (plex_libraries IS NOT NULL AND plex_libraries != '{}' AND plex_libraries != 'null')
      `);
      
      console.log(`?? Found ${users.length} users with Plex access to check`);
      
      let usersChecked = 0;
      let usersWithPendingInvites = 0;
      let usersWithoutPendingInvites = 0;
      
      for (const user of users) {
        try {
          const userEmail = user.plex_email || user.email;
          
          if (!userEmail) {
            console.log(`?? Skipping ${user.name} - no email configured`);
            continue;
          }
          
          // Check for pending invites
          const pendingInvites = await this.checkUserPendingInvites(userEmail);
          
          // Update database with pending invites status
          await db.query(`
            UPDATE users 
            SET pending_plex_invites = ?, updated_at = NOW()
            WHERE id = ?
          `, [pendingInvites ? JSON.stringify(pendingInvites) : null, user.id]);
          
          if (pendingInvites) {
            const serverGroups = Object.keys(pendingInvites);
            console.log(`? ${user.name} has pending invites for: ${serverGroups.join(', ')}`);
            usersWithPendingInvites++;
          } else {
            console.log(`? ${user.name} has no pending invites`);
            usersWithoutPendingInvites++;
          }
          
          usersChecked++;
          
          // Small delay to avoid overwhelming the API
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          console.error(`? Error checking pending invites for ${user.name}:`, error.message);
        }
      }
      
      console.log(`\n?? PENDING INVITES SYNC SUMMARY:`);
      console.log(`?? Users checked: ${usersChecked}`);
      console.log(`? Users with pending invites: ${usersWithPendingInvites}`);
      console.log(`? Users without pending invites: ${usersWithoutPendingInvites}`);
      
    } catch (error) {
      console.error('? Error syncing pending invites:', error);
      throw error;
    }
  }

  // Update libraries in database (kept)
  async updateLibrariesInDatabase(serverGroup, serverType, libraries) {
    try {
      const settingKey = `plex_libraries_${serverGroup}_${serverType}`;
      const settingValue = JSON.stringify(libraries);
      
      await db.query(`
        INSERT INTO settings (setting_key, setting_value, setting_type)
        VALUES (?, ?, 'json')
        ON DUPLICATE KEY UPDATE setting_value = ?, updated_at = NOW()
      `, [settingKey, settingValue, settingValue]);
    } catch (error) {
      console.error('Error updating libraries in database:', error);
      throw error;
    }
  }


// Update the sync timestamp setting
  async updateSyncTimestamp() {
    try {
      const timestamp = new Date().toISOString();
      await db.query(`
        INSERT INTO settings (setting_key, setting_value, setting_type)
        VALUES ('last_plex_sync', ?, 'string')
        ON DUPLICATE KEY UPDATE setting_value = ?, updated_at = NOW()
      `, [timestamp, timestamp]);
      
      console.log('? Sync timestamp updated successfully');
    } catch (error) {
      console.error('? Error updating sync timestamp:', error);
    }
  }

  // Remove user from Plex using Python
  async removeUserFromPlex(userEmail, serverGroup) {
    try {
      console.log(`??? Removing ${userEmail} from ${serverGroup}`);
      
      const serverConfigs = this.getServerConfig();
      const config = serverConfigs[serverGroup];
      
      if (!config) {
        throw new Error(`Invalid server group: ${serverGroup}`);
      }

      const results = {};
      
// Use the Python wrapper's removeUserFromServerGroup method
// This handles both regular and 4K servers automatically
try {
  const result = await pythonPlexService.removeUserFromServerGroup(userEmail, serverGroup);
  
  // Extract the detailed results (should have regular and fourk details)
  results = result.details || result;
  
  console.log(`?? Python removal detailed results:`, result);
} catch (error) {
  results = { 
    regular: { success: false, error: error.message },
    fourk: { success: false, error: error.message }
  };
}
      
      return {
        success: true,
        results: results,
        serverGroup: serverGroup
      };
    } catch (error) {
      console.error('Error removing user from Plex:', error);
      throw error;
    }
  }

// FIXED: Sync user library access while preserving non-Plex tags
async syncUserLibraryAccess() {
  try {
    console.log('🔄 Syncing user library access with all Plex servers...');
    
    // Get all users with any Plex configuration
    const users = await db.query(`
      SELECT id, name, email, plex_email, tags
      FROM users 
      WHERE plex_email IS NOT NULL AND plex_email != ''
      ORDER BY name
    `);
    
    if (users.length === 0) {
      console.log('ℹ️ No users with Plex emails found');
      return;
    }
    
    console.log(`📋 Checking ${users.length} users against Plex servers...`);
    
    // Get all Plex users from all servers
    const allPlexUsers = await this.getAllPlexUsers();
    
    let updatedUsers = 0;
    let usersWithAccess = 0;
    let usersWithoutAccess = 0;
    
    for (const dbUser of users) {
      const emailsToCheck = [dbUser.plex_email, dbUser.email].filter(e => e);
      
      // Find if this user exists in any Plex server
      let foundPlexUser = null;
      for (const email of emailsToCheck) {
        foundPlexUser = allPlexUsers.get(email.toLowerCase());
        if (foundPlexUser) break;
      }
      
      // Parse existing tags and preserve non-Plex tags
      let existingTags = [];
      try {
        existingTags = dbUser.tags ? JSON.parse(dbUser.tags) : [];
      } catch (e) {
        console.log(`⚠️ Could not parse tags for ${dbUser.name}, using empty array`);
        existingTags = [];
      }
      
      // Preserve all non-Plex tags (IPTV, etc.)
      const nonPlexTags = existingTags.filter(tag => !tag.startsWith('Plex '));
      
      if (foundPlexUser) {
        console.log(`✅ FOUND: ${dbUser.name} (${emailsToCheck.join(', ')}) in Plex servers`);
        
        // Build library access object
        const libraryAccess = foundPlexUser.groups;
        
        // Determine NEW Plex tags based on their access
        const newPlexTags = [];
        for (const [groupName, groupAccess] of Object.entries(libraryAccess)) {
          if (groupAccess.regular && groupAccess.regular.length > 0) {
            newPlexTags.push(`Plex ${groupName.slice(-1)}`); // "Plex 1" or "Plex 2"
          }
        }
        
        // CRITICAL FIX: Combine preserved non-Plex tags with new Plex tags
        const finalTags = [...nonPlexTags, ...newPlexTags];
        
        // Update database with preserved tags
        await db.query(`
          UPDATE users 
          SET plex_libraries = ?, tags = ?, updated_at = NOW()
          WHERE id = ?
        `, [JSON.stringify(libraryAccess), JSON.stringify(finalTags), dbUser.id]);
        
        console.log(`📝 Updated ${dbUser.name}: Preserved tags [${nonPlexTags.join(', ')}], Added Plex tags [${newPlexTags.join(', ')}]`);
        
        usersWithAccess++;
      } else {
        console.log(`❌ NO ACCESS: ${dbUser.name} (${emailsToCheck.join(', ')}) - not found in Plex`);
        
        // Clear their library access but keep non-Plex tags
        await db.query(`
          UPDATE users 
          SET plex_libraries = ?, tags = ?, updated_at = NOW()
          WHERE id = ?
        `, ['{}', JSON.stringify(nonPlexTags), dbUser.id]);
        
        console.log(`📝 Cleared Plex access for ${dbUser.name} but preserved tags: [${nonPlexTags.join(', ')}]`);
        
        usersWithoutAccess++;
      }
      
      updatedUsers++;
    }
    
    console.log(`\n📊 SYNC SUMMARY:`);
    console.log(`📊 Database users updated: ${updatedUsers}`);
    console.log(`✅ Users with Plex access: ${usersWithAccess}`);
    console.log(`❌ Users without Plex access: ${usersWithoutAccess}`);
    console.log(`🎯 Total unique Plex users found: ${allPlexUsers.size}`);
    
  } catch (error) {
    console.error('❌ Error syncing user library access:', error);
    throw error;
  }
}

  // FIXED: updateUserLibraryAccess - This should be called when editing a user
  async updateUserLibraryAccess(userEmail) {
    try {
      console.log(`🔄 Updating library access for: ${userEmail}`);
      
      // Get current access from Plex servers
      const currentAccess = await this.getUserCurrentAccess(userEmail);
      console.log(`📊 Current Plex access:`, currentAccess);
      
      // Check pending invites
      const pendingInvites = await this.checkUserPendingInvites(userEmail);
      console.log(`📧 Pending invites:`, pendingInvites);
      
      // Find user in database
      const [dbUser] = await db.query(`
        SELECT id, name, email, plex_email, plex_libraries, pending_plex_invites
        FROM users 
        WHERE email = ? OR plex_email = ?
      `, [userEmail, userEmail]);
      
      if (!dbUser) {
        console.log(`⚠️ User not found in database: ${userEmail}`);
        return { success: false, error: 'User not found' };
      }
      
      // Parse existing data
      let existingLibraries = {};
try {
  existingLibraries = dbUser.plex_libraries ? JSON.parse(dbUser.plex_libraries) : {};
} catch (parseError) {
  console.log(`⚠️ Could not parse plex_libraries for ${dbUser.name}, using empty object:`, parseError.message);
  existingLibraries = {};
}
      const existingInvites = dbUser.pending_plex_invites ? JSON.parse(dbUser.pending_plex_invites) : null;
      
      // Check if updates are needed
      const librariesChanged = JSON.stringify(existingLibraries) !== JSON.stringify(currentAccess);
      const invitesChanged = JSON.stringify(existingInvites) !== JSON.stringify(pendingInvites);
      
      if (librariesChanged || invitesChanged) {
        console.log(`💾 Updating database for ${dbUser.name}:`);
        if (librariesChanged) console.log(`   📚 Libraries changed`);
        if (invitesChanged) console.log(`   📧 Pending invites changed`);
        
        await db.query(`
          UPDATE users 
          SET plex_libraries = ?, pending_plex_invites = ?, updated_at = NOW()
          WHERE id = ?
        `, [
          JSON.stringify(currentAccess),
          pendingInvites ? JSON.stringify(pendingInvites) : null,
          dbUser.id
        ]);
        
        return {
          success: true,
          updated: true,
          changes: {
            libraries: librariesChanged,
            pendingInvites: invitesChanged
          },
          data: {
            libraries: currentAccess,
            pendingInvites: pendingInvites
          }
        };
      } else {
        console.log(`✅ No changes needed for ${dbUser.name}`);
        return {
          success: true,
          updated: false,
          data: {
            libraries: currentAccess,
            pendingInvites: pendingInvites
          }
        };
      }
      
    } catch (error) {
      console.error(`❌ Error updating user library access for ${userEmail}:`, error);
      return { success: false, error: error.message };
    }
  }

  // NEW: This should be called from the frontend when editing a user
  async refreshUserDataForEditing(userEmail) {
    try {
      console.log(`🔄 Refreshing user data for editing: ${userEmail}`);
      
      // Update their current access and pending status
      const updateResult = await this.updateUserLibraryAccess(userEmail);
      
      // Get the fresh user data from database
      const [freshUser] = await db.query(`
        SELECT * FROM users 
        WHERE email = ? OR plex_email = ?
        LIMIT 1
      `, [userEmail, userEmail]);
      
      if (!freshUser) {
        throw new Error('User not found after refresh');
      }
      
      // Parse JSON fields
try {
  freshUser.tags = freshUser.tags ? JSON.parse(freshUser.tags) : [];
} catch (e) {
  console.log(`⚠️ Could not parse tags for ${freshUser.name}:`, e.message);
  freshUser.tags = [];
}

try {
  freshUser.plex_libraries = freshUser.plex_libraries ? JSON.parse(freshUser.plex_libraries) : {};
} catch (e) {
  console.log(`⚠️ Could not parse plex_libraries for ${freshUser.name}:`, e.message);
  freshUser.plex_libraries = {};
}

try {
  freshUser.pending_plex_invites = freshUser.pending_plex_invites ? JSON.parse(freshUser.pending_plex_invites) : null;
} catch (e) {
  console.log(`⚠️ Could not parse pending_plex_invites for ${freshUser.name}:`, e.message);
  freshUser.pending_plex_invites = null;
}
      
      console.log(`✅ Refreshed user data for ${freshUser.name}`);
      
      return {
        success: true,
        user: freshUser,
        updateResult: updateResult
      };
      
    } catch (error) {
      console.error(`❌ Error refreshing user data:`, error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new PlexService();