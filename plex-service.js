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
      console.error(`❌ Plex.tv API request failed for ${path}:`, error.message);
      throw error;
    }
  }

  // Get server libraries using Plex.tv API
  async getServerLibraries(serverConfig) {
    try {
      console.log(`📚 Fetching libraries for ${serverConfig.name}...`);
      
      const xmlData = await this.makePlexTvRequest(serverConfig.serverId, serverConfig.token, '/sections');
      const result = await this.parser.parseStringPromise(xmlData);
      
      if (!result?.MediaContainer?.Directory) {
        console.log(`⚠️ No libraries found for ${serverConfig.name}`);
        return [];
      }
      
      const directories = Array.isArray(result.MediaContainer.Directory) 
        ? result.MediaContainer.Directory 
        : [result.MediaContainer.Directory];
      
      const libraries = directories.map(dir => ({
        id: dir.$.key,
        title: dir.$.title,
        type: dir.$.type
      }));
      
      console.log(`✅ Found ${libraries.length} libraries for ${serverConfig.name}`);
      return libraries;
    } catch (error) {
      console.error(`❌ Error fetching libraries for ${serverConfig.name}:`, error.message);
      throw error;
    }
  }

  // Share libraries with user via Python service
  async shareLibrariesWithUser(serverGroup, userEmail, regularLibraries = [], fourkLibraries = []) {
    try {
      console.log(`🔗 Sharing libraries with ${userEmail} for ${serverGroup}`);
      
      const result = await pythonPlexService.inviteUser(
        userEmail,
        serverGroup,
        regularLibraries,
        fourkLibraries
      );
      
      console.log(`✅ Library sharing completed for ${userEmail}`);
      return result;
    } catch (error) {
      console.error(`❌ Error sharing libraries with ${userEmail}:`, error);
      throw error;
    }
  }

  // Remove user from Plex servers via Python service
  async removeUserFromPlex(userEmail, serverGroup = null) {
    try {
      console.log(`🗑️ Removing ${userEmail} from Plex${serverGroup ? ` (${serverGroup})` : ''}`);
      
      if (serverGroup) {
        const result = await pythonPlexService.removeUserFromServerGroup(userEmail, serverGroup);
        console.log(`✅ User removal completed for ${serverGroup}`);
        return result;
      } else {
        // Remove from all server groups
        const serverConfigs = this.getServerConfig();
        const results = {};
        
        for (const group of Object.keys(serverConfigs)) {
          try {
            results[group] = await pythonPlexService.removeUserFromServerGroup(userEmail, group);
          } catch (error) {
            results[group] = { success: false, error: error.message };
          }
        }
        
        console.log(`✅ User removal completed for all servers`);
        return { success: true, results };
      }
    } catch (error) {
      console.error(`❌ Error removing user from Plex:`, error);
      throw error;
    }
  }

  // NEW: Check pending invites for a specific user
  async checkUserPendingInvites(userEmail) {
    try {
      console.log(`🔍 Checking pending invites for: ${userEmail}`);
      
      const result = await pythonPlexService.checkInviteStatusAllServers(userEmail);
      
      if (!result.success) {
        console.error(`❌ Failed to check invites for ${userEmail}:`, result.error);
        return null;
      }
      
      // Transform the result into our format
      const pendingInvites = {};
      
      for (const [serverGroup, servers] of Object.entries(result.servers)) {
        const groupPendingInvites = {};
        
        for (const [serverType, serverInfo] of Object.entries(servers)) {
          if (serverInfo.status === 'pending') {
            groupPendingInvites[serverType] = {
              server: serverInfo.server,
              email: serverInfo.email,
              invite_id: serverInfo.invite_id || null
            };
          }
        }
        
        // Only add to pendingInvites if there are actually pending invites for this group
        if (Object.keys(groupPendingInvites).length > 0) {
          pendingInvites[serverGroup] = groupPendingInvites;
        }
      }
      
      console.log(`📊 Pending invites for ${userEmail}:`, Object.keys(pendingInvites).length > 0 ? pendingInvites : 'None');
      
      return Object.keys(pendingInvites).length > 0 ? pendingInvites : null;
    } catch (error) {
      console.error(`❌ Error checking pending invites for ${userEmail}:`, error);
      return null;
    }
  }

  // NEW: Sync pending invites for all users with Plex access
  async syncPendingInvites() {
    try {
      console.log('\n🔄 Starting pending invites sync...');
      
      // Get all users who have Plex library access or Plex email
      const users = await db.query(`
        SELECT id, name, email, plex_email, plex_libraries 
        FROM users 
        WHERE (plex_email IS NOT NULL AND plex_email != '') 
           OR (plex_libraries IS NOT NULL AND plex_libraries != '{}' AND plex_libraries != 'null')
      `);
      
      console.log(`📊 Found ${users.length} users with Plex access to check`);
      
      let usersChecked = 0;
      let usersWithPendingInvites = 0;
      let usersWithoutPendingInvites = 0;
      
      for (const user of users) {
        try {
          const userEmail = user.plex_email || user.email;
          
          if (!userEmail) {
            console.log(`⚠️ Skipping ${user.name} - no email configured`);
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
            console.log(`⏳ ${user.name} has pending invites for: ${serverGroups.join(', ')}`);
            usersWithPendingInvites++;
          } else {
            console.log(`✅ ${user.name} has no pending invites`);
            usersWithoutPendingInvites++;
          }
          
          usersChecked++;
          
          // Small delay to avoid overwhelming the API
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          console.error(`❌ Error checking pending invites for ${user.name}:`, error.message);
        }
      }
      
      console.log(`\n📊 PENDING INVITES SYNC SUMMARY:`);
      console.log(`📊 Users checked: ${usersChecked}`);
      console.log(`⏳ Users with pending invites: ${usersWithPendingInvites}`);
      console.log(`✅ Users without pending invites: ${usersWithoutPendingInvites}`);
      
    } catch (error) {
      console.error('❌ Error syncing pending invites:', error);
      throw error;
    }
  }

  // Update user library access in database (kept but enhanced with pending invite check)
  async updateUserLibraryAccessInDatabase(userEmail, libraryAccess) {
    try {
      console.log(`📝 Updating library access for: ${userEmail}`);
      
      // Sort library access for consistent storage
      const sortedLibraryAccess = {};
      for (const [serverGroup, access] of Object.entries(libraryAccess)) {
        sortedLibraryAccess[serverGroup] = {
          regular: (access.regular || []).sort((a, b) => a.id.localeCompare(b.id)),
          fourk: (access.fourk || []).sort((a, b) => a.id.localeCompare(b.id))
        };
      }
      
      // Find user by plex_email or email
      const [user] = await db.query(`
        SELECT id, name FROM users 
        WHERE plex_email = ?
           OR plex_email = ?
      `, [userEmail, userEmail]);
      
      if (user) {
        await db.query(`
          UPDATE users 
          SET plex_libraries = ?, updated_at = NOW()
          WHERE id = ?
        `, [JSON.stringify(sortedLibraryAccess), user.id]);
        
        console.log(`✅ Database updated for user: ${user.name}`);
        
        // Also check and update pending invites for this user
        try {
          const pendingInvites = await this.checkUserPendingInvites(userEmail);
          await db.query(`
            UPDATE users 
            SET pending_plex_invites = ?, updated_at = NOW()
            WHERE id = ?
          `, [pendingInvites ? JSON.stringify(pendingInvites) : null, user.id]);
          
          if (pendingInvites) {
            console.log(`⏳ Updated pending invites for ${user.name}`);
          }
        } catch (error) {
          console.error(`⚠️ Could not update pending invites for ${user.name}:`, error.message);
        }
        
      } else {
        console.log(`⚠️ User not found in database: ${userEmail}`);
      }
      
    } catch (error) {
      console.error('❌ Error updating user library access in database:', error);
      throw error;
    }
  }

  // Sync all libraries and store in database (enhanced to include pending invites sync)
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
      
      // NEW: Sync pending invites for all users
      console.log('\n🔄 Syncing pending invites...');
      await this.syncPendingInvites();
      
      // Update the last sync timestamp
      await this.updateSyncTimestamp();
      
      console.log('\n✅ Complete Plex sync finished successfully!');
      
      return { 
        success: true, 
        message: 'Plex sync completed successfully',
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('❌ Plex sync failed:', error);
      throw error;
    }
  }

  // Get all unique Plex users from across all servers (kept)
  async getAllPlexUsers() {
    try {
      console.log('👥 Fetching all Plex users...');
      
      const allUsers = new Map(); // email -> user data
      const serverConfigs = this.getServerConfig();
      
      for (const [groupName, groupConfig] of Object.entries(serverConfigs)) {
        console.log(`📡 Checking users on ${groupName}...`);
        
        // Get users from regular server
        try {
          const regularUsers = await this.getPlexUsersForServer(groupConfig.regular, groupName, 'regular');
          regularUsers.forEach((user, email) => {
            if (!allUsers.has(email)) {
              allUsers.set(email, { serverAccess: {}, tags: new Set() });
            }
            allUsers.get(email).serverAccess[`${groupName}_regular`] = user.access;
            user.tags.forEach(tag => allUsers.get(email).tags.add(tag));
          });
        } catch (error) {
          console.error(`❌ Error getting regular users for ${groupName}:`, error.message);
        }
        
        // Get users from 4K server
        try {
          const fourkUsers = await this.getPlexUsersForServer(groupConfig.fourk, groupName, 'fourk');
          fourkUsers.forEach((user, email) => {
            if (!allUsers.has(email)) {
              allUsers.set(email, { serverAccess: {}, tags: new Set() });
            }
            allUsers.get(email).serverAccess[`${groupName}_fourk`] = user.access;
            user.tags.forEach(tag => allUsers.get(email).tags.add(tag));
          });
        } catch (error) {
          console.error(`❌ Error getting 4K users for ${groupName}:`, error.message);
        }
      }
      
      // Convert tags Set to Array for each user
      allUsers.forEach((userData, email) => {
        userData.tags = Array.from(userData.tags);
      });
      
      console.log(`👥 Found ${allUsers.size} unique Plex users across all servers`);
      return allUsers;
    } catch (error) {
      console.error('❌ Error getting all Plex users:', error);
      throw error;
    }
  }

  // Get Plex users for a specific server (kept)
  async getPlexUsersForServer(serverConfig, groupName, serverType) {
    try {
      console.log(`👥 Getting users for ${serverConfig.name}...`);
      
      const usersMap = new Map();
      const xmlData = await this.makePlexTvRequest(serverConfig.serverId, serverConfig.token, '/shared_servers');
      const result = await this.parser.parseStringPromise(xmlData);
      
      if (!result?.MediaContainer?.SharedServer) {
        console.log(`📊 No shared users found on ${serverConfig.name}`);
        return usersMap;
      }
      
      const sharedServers = Array.isArray(result.MediaContainer.SharedServer) 
        ? result.MediaContainer.SharedServer 
        : [result.MediaContainer.SharedServer];
      
      sharedServers.forEach(server => {
        const email = server.$.email?.toLowerCase();
        if (email) {
          const sections = server.Section ? 
            (Array.isArray(server.Section) ? server.Section : [server.Section]) : [];
          
          usersMap.set(email, {
            access: sections.map(section => ({
              id: section.$.id,
              title: section.$.title,
              type: section.$.type
            })),
            tags: [groupName.charAt(0).toUpperCase() + groupName.slice(1)]
          });
        }
      });
      
      console.log(`👥 Found ${usersMap.size} users on ${serverConfig.name}`);
      return usersMap;
    } catch (error) {
      if (error.message.includes('404')) {
        console.log(`📊 No shared users found on ${serverConfig.name} (404 response)`);
        return new Map();
      }
      console.error(`❌ Error getting users for ${serverConfig.name}:`, error.message);
      throw error;
    }
  }

  // Sync user library access (kept)
  async syncUserLibraryAccess() {
    try {
      console.log('\n👥 Syncing user library access with current Plex state...');
      
      // Get all current Plex users
      const allPlexUsers = await this.getAllPlexUsers();
      console.log(`📊 Found ${allPlexUsers.size} total users across all Plex servers`);
      
      // Get all database users
      const dbUsers = await db.query('SELECT id, name, email, plex_email FROM users');
      console.log(`📊 Found ${dbUsers.length} users in database`);
      
      let updatedUsers = 0;
      let usersWithAccess = 0;
      let usersWithoutAccess = 0;
      
      for (const dbUser of dbUsers) {
        const emailsToCheck = [
          dbUser.plex_email?.toLowerCase(),
          dbUser.email?.toLowerCase()
        ].filter(Boolean);
        
        // Find this user in Plex data
        let plexUserData = null;
        for (const email of emailsToCheck) {
          if (allPlexUsers.has(email)) {
            plexUserData = allPlexUsers.get(email);
            break;
          }
        }
        
        if (plexUserData) {
          console.log(`✅ FOUND: ${dbUser.name} (${emailsToCheck.join(', ')}) - updating database`);
          
          // Convert server access to library format
          const libraryAccess = {};
          const uniqueTags = new Set(plexUserData.tags);
          
          Object.keys(plexUserData.serverAccess).forEach(serverKey => {
            const [group, type] = serverKey.split('_');
            if (!libraryAccess[group]) {
              libraryAccess[group] = { regular: [], fourk: [] };
            }
            libraryAccess[group][type] = plexUserData.serverAccess[serverKey];
          });
          
          // Update user in database
          await db.query(`
            UPDATE users 
            SET plex_libraries = ?, tags = ?, updated_at = NOW()
            WHERE id = ?
          `, [JSON.stringify(libraryAccess), JSON.stringify(Array.from(uniqueTags)), dbUser.id]);
          
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