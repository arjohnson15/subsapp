const axios = require('axios');
const xml2js = require('xml2js');
const db = require('./database-config');
const pythonPlexService = require('./python-plex-wrapper');

class PlexService {
  constructor() {
    this.parser = new xml2js.Parser({ explicitArray: false });
    this.initializeSync();
  }

  // Initialize periodic library sync
  initializeSync() {
    console.log('Starting Plex library sync service...');
    
    // Sync immediately on startup
    this.syncAllLibraries();
    
    // Set up hourly sync
    setInterval(() => {
      console.log('Running scheduled Plex library sync...');
      this.syncAllLibraries();
    }, 60 * 60 * 1000); // 1 hour
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
  async makePlexTvRequest(serverId, token, path = '', method = 'GET', data = null) {
    try {
      const url = `https://plex.tv/api/servers/${serverId}${path}?X-Plex-Token=${token}`;
      
      const config = {
        method: method,
        url: url,
        headers: {
          'Accept': 'application/xml',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 15000
      };

      if (data && (method === 'POST' || method === 'PUT')) {
        config.data = data;
      }
      
      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error(`❌ Plex.tv API request failed for server ${serverId}:`, error.message);
      throw error;
    }
  }

  // Make request to direct server (for libraries)
  async makeDirectServerRequest(serverUrl, token, path = '') {
    try {
      const url = `${serverUrl}${path}`;
      
      const response = await axios.get(url, {
        headers: {
          'X-Plex-Token': token,
          'Accept': 'application/xml'
        },
        timeout: 10000
      });
      
      return response.data;
    } catch (error) {
      console.error(`❌ Direct server request failed for ${serverUrl}:`, error.message);
      throw error;
    }
  }

  // Get libraries from a specific server (using direct server API)
  async getServerLibraries(serverConfig) {
    try {
      const xmlData = await this.makeDirectServerRequest(serverConfig.url, serverConfig.token, '/library/sections');
      const result = await this.parser.parseStringPromise(xmlData);
      
      if (!result.MediaContainer || !result.MediaContainer.Directory) {
        console.log(`No libraries found on ${serverConfig.name}`);
        return [];
      }

      const directories = Array.isArray(result.MediaContainer.Directory) 
        ? result.MediaContainer.Directory 
        : [result.MediaContainer.Directory];

      const libraries = directories.map(dir => ({
        id: dir.$.key,              
        title: dir.$.title,
        type: dir.$.type,
        agent: dir.$.agent
      }));      
      
      console.log(`📚 Found ${libraries.length} libraries on ${serverConfig.name}`);
      return libraries;
    } catch (error) {
      console.error(`❌ Failed to get libraries for ${serverConfig.name}:`, error.message);
      return [];
    }
  }

  // Get ALL shared users from a server (kept for reading operations)
  async getAllSharedUsersFromServer(serverConfig) {
    try {
      const xmlData = await this.makePlexTvRequest(serverConfig.serverId, serverConfig.token, '/shared_servers');
      const result = await this.parser.parseStringPromise(xmlData);
      
      if (!result.MediaContainer || !result.MediaContainer.SharedServer) {
        return [];
      }

      const sharedServers = Array.isArray(result.MediaContainer.SharedServer)
        ? result.MediaContainer.SharedServer
        : [result.MediaContainer.SharedServer];

      const allSharedUsers = [];

      for (const sharedServer of sharedServers) {
        const userEmail = sharedServer.$.email;
        const username = sharedServer.$.username;
        const sharedServerId = sharedServer.$.id;

        // Get their library access
        const sharedLibraries = [];
        if (sharedServer.Section) {
          const sections = Array.isArray(sharedServer.Section) 
            ? sharedServer.Section 
            : [sharedServer.Section];

          // Only get sections that are shared
          const userSharedLibraries = sections
            .filter(section => section.$.shared === '1')
            .map(section => ({
              id: section.$.key,       
              title: section.$.title,
              type: section.$.type
            }));          
          sharedLibraries.push(...userSharedLibraries);
        }

        allSharedUsers.push({
          email: userEmail,
          username: username,
          sharedServerId: sharedServerId,
          libraries: sharedLibraries
        });
      }
      
      console.log(`📊 Found ${allSharedUsers.length} shared users on ${serverConfig.name}`);
      return allSharedUsers;
      
    } catch (error) {
      console.error(`❌ Failed to get shared users from ${serverConfig.name}:`, error.message);
      return [];
    }
  }

  // Get user's current access across all servers (kept - reading only)
  async getUserCurrentAccess(userEmail) {
    try {
      console.log(`🔍 Getting current access for user: ${userEmail}`);
      
      const serverConfigs = this.getServerConfig();
      const access = {};
      
      for (const [groupName, groupConfig] of Object.entries(serverConfigs)) {
        // Get ALL shared users from regular server and find our user
        const regularSharedUsers = await this.getAllSharedUsersFromServer(groupConfig.regular);
        const regularUserAccess = regularSharedUsers.find(user => user.email.toLowerCase() === userEmail.toLowerCase());
        const regularLibraryIds = regularUserAccess ? regularUserAccess.libraries.map(lib => lib.id) : [];
        
        // Get ALL shared users from 4K server and find our user
        let fourkLibraryIds = [];
        try {
          const fourkSharedUsers = await this.getAllSharedUsersFromServer(groupConfig.fourk);
          const fourkUserAccess = fourkSharedUsers.find(user => user.email.toLowerCase() === userEmail.toLowerCase());
          
          // If user has any access to 4K server, give them the hardcoded libraries
          if (fourkUserAccess && fourkUserAccess.libraries.length > 0) {
            fourkLibraryIds = groupConfig.fourk.libraries.map(lib => lib.id);
          }
        } catch (error) {
          // No 4K access - this is normal, don't log error
        }
        
        access[groupName] = {
          regular: regularLibraryIds,
          fourk: fourkLibraryIds
        };
        
        console.log(`📊 ${groupName} access for ${userEmail}: ${regularLibraryIds.length} regular + ${fourkLibraryIds.length} 4K libraries`);
      }
      
      return access;
    } catch (error) {
      console.error('❌ Error getting user current access:', error);
      return {};
    }
  }

  // REPLACED: Enhanced sharing method now uses Python
  async shareLibrariesWithUserEnhanced(userEmail, serverGroup, newLibraries) {
    try {
      console.log(`🐍 Delegating to Python: Enhanced library sharing for ${userEmail} on ${serverGroup}`);
      console.log(`📋 New library selection:`, newLibraries);
      
      // Use Python service for all library changes
      const result = await pythonPlexService.shareLibrariesWithUserEnhanced(userEmail, serverGroup, newLibraries);
      
      // Update database with new access
      if (result.success) {
        const updatedAccess = await this.getUserCurrentAccess(userEmail);
        await this.updateUserLibraryAccessInDatabase(userEmail, updatedAccess);
        console.log(`💾 Database updated with new access via Python`);
      }
      
      return result;
      
    } catch (error) {
      console.error(`❌ Error in Python-enhanced library sharing:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // REPLACED: Remove user access now uses Python
  async removeUserAccess(userEmail, serverGroups) {
    try {
      console.log(`🐍 Delegating to Python: Removing ${userEmail} from server groups:`, serverGroups);
      
      const results = [];
      
      for (const serverGroup of serverGroups) {
        try {
          const result = await pythonPlexService.removeUserFromServerGroup(userEmail, serverGroup);
          results.push(result);
        } catch (error) {
          console.error(`Error removing user from ${serverGroup}:`, error);
          results.push({
            success: false,
            error: error.message,
            server_group: serverGroup
          });
        }
      }
      
      // Update database to reflect removal
      const emptyAccess = { plex1: { regular: [], fourk: [] }, plex2: { regular: [], fourk: [] } };
      await this.updateUserLibraryAccessInDatabase(userEmail, emptyAccess);
      
      return {
        success: true,
        message: `Processed removal from ${serverGroups.length} server groups via Python`,
        details: results
      };
      
    } catch (error) {
      console.error('Error removing user access via Python:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

// Update user's library access in database with consistent sorting
async updateUserLibraryAccessInDatabase(userEmail, libraryAccess) {
  try {
    console.log(`💾 Updating database for ${userEmail}:`, libraryAccess);
    
    // CRITICAL FIX: Sort all arrays to ensure consistent comparison later
    const sortedLibraryAccess = {};
    for (const [serverGroup, access] of Object.entries(libraryAccess)) {
      sortedLibraryAccess[serverGroup] = {
        regular: (access.regular || []).slice().sort(), // Sort regular arrays
        fourk: (access.fourk || []).slice().sort()      // Sort 4K arrays
      };
    }
    
    console.log(`📋 Sorted library access for database:`, sortedLibraryAccess);
    
    // Find user by email or plex_email
    const [user] = await db.query(`
      SELECT id, name FROM users 
      WHERE email = ? OR plex_email = ?
    `, [userEmail, userEmail]);
    
    if (user) {
      await db.query(`
        UPDATE users 
        SET plex_libraries = ?, updated_at = NOW()
        WHERE id = ?
      `, [JSON.stringify(sortedLibraryAccess), user.id]);
      
      console.log(`✅ Database updated for user: ${user.name} (ID: ${user.id})`);
      console.log(`📊 Stored sorted access: ${JSON.stringify(sortedLibraryAccess)}`);
      return true;
    } else {
      console.log(`⚠️ User not found in database: ${userEmail}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error updating database:`, error);
    throw error;
  }
}

  // Sync all libraries and store in database (kept - no changes needed)
  async syncAllLibraries() {
    try {
      console.log('🔄 Syncing Plex libraries using Plex.tv API...');
      
      const serverConfigs = this.getServerConfig();
      
      for (const [groupName, groupConfig] of Object.entries(serverConfigs)) {
        console.log(`🔄 Syncing group: ${groupName}`);
        
        // Sync regular server libraries
        const regularLibs = await this.getServerLibraries(groupConfig.regular);
        await this.updateLibrariesInDatabase(groupName, 'regular', regularLibs);
        console.log(`✅ Synced ${regularLibs.length} regular libraries for ${groupName}`);
        
        // Use hardcoded 4K libraries
        const fourkLibs = groupConfig.fourk.libraries || [];
        await this.updateLibrariesInDatabase(groupName, 'fourk', fourkLibs);
        console.log(`✅ Using ${fourkLibs.length} hardcoded 4K libraries for ${groupName}`);
      }
      
      // Sync user access to match current state
      console.log('\n🔄 Syncing user library access...');
      await this.syncUserLibraryAccess();
      
      // Update the last sync timestamp
      await this.updateSyncTimestamp();
      
      console.log('\n✅ Complete Plex sync finished successfully!');
      return { success: true, timestamp: new Date().toISOString() };
    } catch (error) {
      console.error('❌ Error syncing libraries:', error);
      return { success: false, error: error.message };
    }
  }

  // Sync user library access (kept - reading only)
  async syncUserLibraryAccess() {
    try {
      console.log('\n🔄 Syncing user library access with Plex servers...');
      
      const serverConfigs = this.getServerConfig();
      
      // Step 1: Get ALL shared users from ALL servers
      console.log('📊 Step 1: Gathering all shared users from Plex servers...');
      const allPlexUsers = new Map();
      
      for (const [groupName, groupConfig] of Object.entries(serverConfigs)) {
        const regularUsers = await this.getAllSharedUsersFromServer(groupConfig.regular);
        
        let fourkUsers = [];
        try {
          fourkUsers = await this.getAllSharedUsersFromServer(groupConfig.fourk);
        } catch (error) {
          // 4K server not accessible - this is normal
        }
        
        // Process regular server users
        for (const user of regularUsers) {
          const email = user.email.toLowerCase();
          if (!allPlexUsers.has(email)) {
            allPlexUsers.set(email, { 
              plexUsername: user.username,
              serverAccess: {} 
            });
          }
          
          allPlexUsers.get(email).serverAccess[groupName] = {
            regular: user.libraries.map(lib => lib.id),
            fourk: []
          };
        }
        
        // Process 4K server users
        for (const user of fourkUsers) {
          const email = user.email.toLowerCase();
          if (allPlexUsers.has(email)) {
            if (user.libraries.length > 0) {
              allPlexUsers.get(email).serverAccess[groupName].fourk = groupConfig.fourk.libraries.map(lib => lib.id);
            }
          } else {
            allPlexUsers.set(email, {
              plexUsername: user.username,
              serverAccess: {
                [groupName]: {
                  regular: [],
                  fourk: groupConfig.fourk.libraries.map(lib => lib.id)
                }
              }
            });
          }
        }
      }
      
      console.log(`📊 Found ${allPlexUsers.size} total unique users across all Plex servers`);
      
      // Step 2: Get ALL users from our database
      console.log('📊 Step 2: Getting all users from database...');
      const dbUsers = await db.query(`
        SELECT id, name, email, plex_email, tags, plex_libraries
        FROM users
      `);
      
      console.log(`📊 Found ${dbUsers.length} total users in database`);
      
      // Step 3: Match database users to Plex users
      console.log('📊 Step 3: Matching database users to Plex access...');
      
      let updatedUsers = 0;
      let usersWithAccess = 0;
      let usersWithoutAccess = 0;
      
      for (const dbUser of dbUsers) {
        const emailsToCheck = [];
        if (dbUser.email) emailsToCheck.push(dbUser.email.toLowerCase());
        if (dbUser.plex_email && dbUser.plex_email !== dbUser.email) {
          emailsToCheck.push(dbUser.plex_email.toLowerCase());
        }
        
        let plexUserData = null;
        let matchedEmail = null;
        
        for (const emailToCheck of emailsToCheck) {
          if (allPlexUsers.has(emailToCheck)) {
            plexUserData = allPlexUsers.get(emailToCheck);
            matchedEmail = emailToCheck;
            break;
          }
        }
        
        if (plexUserData) {
          console.log(`✅ MATCHED: ${dbUser.name} found as ${plexUserData.plexUsername} (${matchedEmail})`);
          
          // Update tags based on actual server access
          const newTags = [];
          
          let existingTags = [];
          try {
            if (dbUser.tags) {
              if (typeof dbUser.tags === 'string') {
                if (dbUser.tags.startsWith('[')) {
                  existingTags = JSON.parse(dbUser.tags);
                } else {
                  existingTags = dbUser.tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
                }
              } else if (Array.isArray(dbUser.tags)) {
                existingTags = dbUser.tags;
              }
            }
          } catch (e) {
            existingTags = [];
          }
          
          // Preserve non-Plex tags
          const nonPlexTags = existingTags.filter(tag => !tag.toLowerCase().includes('plex'));
          newTags.push(...nonPlexTags);
          
          // Add Plex tags based on actual access
          for (const [serverGroup, access] of Object.entries(plexUserData.serverAccess)) {
            const hasRegularAccess = access.regular && access.regular.length > 0;
            const hasFourkAccess = access.fourk && access.fourk.length > 0;
            
            if (hasRegularAccess || hasFourkAccess) {
              if (serverGroup === 'plex1') {
                newTags.push('Plex 1');
              } else if (serverGroup === 'plex2') {
                newTags.push('Plex 2');
              }
            }
          }
          
          const uniqueTags = [...new Set(newTags)];
          const totalLibraries = Object.values(plexUserData.serverAccess).reduce((total, group) => {
            return total + (group.regular?.length || 0) + (group.fourk?.length || 0);
          }, 0);
          
          console.log(`   📊 Access: ${totalLibraries} libraries, Tags: [${uniqueTags.join(', ')}]`);
          
          // Update their library access AND tags in database
          await db.query(`
            UPDATE users 
            SET plex_libraries = ?, tags = ?
            WHERE id = ?
          `, [JSON.stringify(plexUserData.serverAccess), JSON.stringify(uniqueTags), dbUser.id]);
          
          usersWithAccess++;
        } else {
          console.log(`❌ NO ACCESS: ${dbUser.name} (${emailsToCheck.join(', ')}) - not found in Plex`);
          
          // Clear their library access
          await db.query(`
            UPDATE users 
            SET plex_libraries = ?
            WHERE id = ?
          `, ['{}', dbUser.id]);
          
          usersWithoutAccess++;
        }
        
        updatedUsers++;
      }
      
      // Final summary
      console.log(`\n📊 SYNC SUMMARY:`);
      console.log(`📊 Database users updated: ${updatedUsers}`);
      console.log(`✅ Users with Plex access: ${usersWithAccess}`);
      console.log(`❌ Users without Plex access: ${usersWithoutAccess}`);
      console.log(`📊 Total unique Plex users found: ${allPlexUsers.size}`);
      
    } catch (error) {
      console.error('❌ Error syncing user library access:', error);
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

  // Get libraries from database for frontend (kept)
  async getLibrariesForGroup(serverGroup) {
    try {
      const serverConfigs = this.getServerConfig();
      const config = serverConfigs[serverGroup];
      
      if (!config) {
        throw new Error(`Invalid server group: ${serverGroup}`);
      }

      const [regularLibsSetting] = await db.query(
        'SELECT setting_value FROM settings WHERE setting_key = ?',
        [`plex_libraries_${serverGroup}_regular`]
      );

      const regularLibs = regularLibsSetting 
        ? JSON.parse(regularLibsSetting.setting_value) 
        : [];

      const [fourkLibsSetting] = await db.query(
        'SELECT setting_value FROM settings WHERE setting_key = ?',
        [`plex_libraries_${serverGroup}_fourk`]
      );

      const fourkLibs = fourkLibsSetting 
        ? JSON.parse(fourkLibsSetting.setting_value) 
        : config.fourk.libraries || [];

      return {
        regular: regularLibs,
        fourk: fourkLibs,
        serverNames: {
          regular: config.regular.name,
          fourk: config.fourk.name
        }
      };
    } catch (error) {
      console.error('Error getting libraries for group:', error);
      throw error;
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
      console.log(`✅ Regular server connection successful: ${config.regular.name}`);

      await this.makePlexTvRequest(config.fourk.serverId, config.fourk.token, '');
      console.log(`✅ 4K server connection successful: ${config.fourk.name}`);

      return { success: true, message: `Connection successful for ${serverGroup}` };
    } catch (error) {
      console.error(`❌ Connection test failed for ${serverGroup}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  // Update the last sync timestamp in database (kept)
  async updateSyncTimestamp() {
    try {
      const now = new Date().toISOString();
      await db.query(`
        INSERT INTO settings (setting_key, setting_value, setting_type)
        VALUES ('last_plex_sync', ?, 'string')
        ON DUPLICATE KEY UPDATE setting_value = ?, updated_at = NOW()
      `, [now, now]);
      console.log('📅 Updated last sync timestamp:', now);
    } catch (error) {
      console.error('❌ Error updating sync timestamp:', error);
    }
  }
}

module.exports = new PlexService();