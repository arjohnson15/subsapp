const axios = require('axios');
const xml2js = require('xml2js');
const db = require('./database-config');

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

  // Server configuration mapping (matches your Python config)
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
          // Hardcoded 4K libraries
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
          // Hardcoded 4K libraries
          libraries: [{ id: '1', title: '4K Movies', type: 'movie' }]
        }
      }
    };
  }

  // Make request to Plex.tv API (like your Python code)
  async makePlexTvRequest(serverId, token, path = '') {
    try {
      const url = `https://plex.tv/api/servers/${serverId}${path}?X-Plex-Token=${token}`;
      
      console.log(`Making Plex.tv API request: ${url}`);
      
      const response = await axios.get(url, {
        headers: {
          'Accept': 'application/xml'
        },
        timeout: 10000
      });
      
      return response.data;
    } catch (error) {
      console.error(`Plex.tv API request failed for server ${serverId}:`, error.message);
      throw error;
    }
  }

  // Make request to direct server (for libraries)
  async makeDirectServerRequest(serverUrl, token, path = '') {
    try {
      const url = `${serverUrl}${path}`;
      
      console.log(`Making direct server request: ${url}`);
      
      const response = await axios.get(url, {
        headers: {
          'X-Plex-Token': token,
          'Accept': 'application/xml'
        },
        timeout: 10000
      });
      
      return response.data;
    } catch (error) {
      console.error(`Direct server request failed for ${serverUrl}:`, error.message);
      throw error;
    }
  }

  // Get libraries from a specific server (using direct server API)
  async getServerLibraries(serverConfig) {
    try {
      console.log(`Fetching libraries from ${serverConfig.name} at ${serverConfig.url}`);
      
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
        id: dir.$.key || dir.$.id,
        title: dir.$.title,
        type: dir.$.type,
        agent: dir.$.agent
      }));
      
      console.log(`Found ${libraries.length} libraries on ${serverConfig.name}:`, libraries.map(l => l.title));
      return libraries;
    } catch (error) {
      console.error(`Failed to get libraries for ${serverConfig.name}:`, error.message);
      return [];
    }
  }

  // Get ALL shared users from a server (regardless of our database)
  async getAllSharedUsersFromServer(serverConfig) {
    try {
      console.log(`🔍 Getting ALL shared users from ${serverConfig.name} (Server ID: ${serverConfig.serverId})`);
      
      const xmlData = await this.makePlexTvRequest(serverConfig.serverId, serverConfig.token, '/shared_servers');
      const result = await this.parser.parseStringPromise(xmlData);
      
      if (!result.MediaContainer || !result.MediaContainer.SharedServer) {
        console.log(`No shared users found on ${serverConfig.name}`);
        return [];
      }

      const sharedServers = Array.isArray(result.MediaContainer.SharedServer)
        ? result.MediaContainer.SharedServer
        : [result.MediaContainer.SharedServer];

      const allSharedUsers = [];

      for (const sharedServer of sharedServers) {
        const userEmail = sharedServer.$.email;
        const username = sharedServer.$.username;
        
        console.log(`👤 Found shared user: ${username} (${userEmail}) on ${serverConfig.name}`);

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
              id: section.$.id,
              title: section.$.title,
              type: section.$.type
            }));
          
          sharedLibraries.push(...userSharedLibraries);
        }

        allSharedUsers.push({
          email: userEmail,
          username: username,
          libraries: sharedLibraries
        });

        console.log(`📚 User ${username} has access to ${sharedLibraries.length} libraries: ${sharedLibraries.map(l => l.title).join(', ')}`);
      }
      
      console.log(`📊 Total shared users on ${serverConfig.name}: ${allSharedUsers.length}`);
      return allSharedUsers;
      
    } catch (error) {
      console.error(`Failed to get shared users from ${serverConfig.name}:`, error.message);
      return [];
    }
  }

  // New method: Get user's current access across all servers by checking each server
  async getUserCurrentAccess(userEmail) {
    try {
      console.log(`🔍 Getting current access for user: ${userEmail}`);
      
      const serverConfigs = this.getServerConfig();
      const access = {};
      
      for (const [groupName, groupConfig] of Object.entries(serverConfigs)) {
        console.log(`🔍 Checking ${groupName} access for ${userEmail}...`);
        
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
          console.log(`No 4K access found for ${userEmail} on ${groupName}: ${error.message}`);
        }
        
        access[groupName] = {
          regular: regularLibraryIds,
          fourk: fourkLibraryIds
        };
        
        console.log(`📊 ${groupName} access for ${userEmail}:`, access[groupName]);
      }
      
      return access;
    } catch (error) {
      console.error('Error getting user current access:', error);
      return {};
    }
  }

  // COMPLETELY REWRITTEN: Sync user library access by checking ALL servers
  async syncUserLibraryAccess() {
    try {
      console.log('🔄 Syncing user library access with Plex servers...');
      console.log('📝 Strategy: Check ALL Plex servers for shared users, then match to our database users');
      
      const serverConfigs = this.getServerConfig();
      
      // Step 1: Get ALL shared users from ALL servers
      console.log('\n📡 Step 1: Getting all shared users from all Plex servers...');
      const allPlexUsers = new Map(); // email -> { serverAccess: {}, plexUsername: string }
      
      for (const [groupName, groupConfig] of Object.entries(serverConfigs)) {
        console.log(`\n🔍 Checking server group: ${groupName}`);
        
        // Get shared users from regular server
        console.log(`📡 Getting shared users from ${groupConfig.regular.name}...`);
        const regularUsers = await this.getAllSharedUsersFromServer(groupConfig.regular);
        
        // Get shared users from 4K server
        console.log(`📡 Getting shared users from ${groupConfig.fourk.name}...`);
        let fourkUsers = [];
        try {
          fourkUsers = await this.getAllSharedUsersFromServer(groupConfig.fourk);
        } catch (error) {
          console.log(`⚠️ Could not get 4K users for ${groupName}: ${error.message}`);
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
            fourk: [] // Will be set below if they have 4K access
          };
        }
        
        // Process 4K server users
        for (const user of fourkUsers) {
          const email = user.email.toLowerCase();
          if (allPlexUsers.has(email)) {
            // User has 4K access, give them hardcoded 4K libraries
            if (user.libraries.length > 0) {
              allPlexUsers.get(email).serverAccess[groupName].fourk = groupConfig.fourk.libraries.map(lib => lib.id);
            }
          } else {
            // User only has 4K access, no regular access
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
      
      console.log(`\n📊 Found ${allPlexUsers.size} total unique users across all Plex servers:`);
      for (const [email, userData] of allPlexUsers.entries()) {
        console.log(`👤 ${userData.plexUsername} (${email}) - Access to ${Object.keys(userData.serverAccess).length} server groups`);
      }
      
      // Step 2: Get ALL users from our database (check both email and plex_email fields)
      console.log('\n📊 Step 2: Getting all users from database...');
      const dbUsers = await db.query(`
        SELECT id, name, email, plex_email, tags, plex_libraries
        FROM users
      `);
      
      console.log(`📋 Found ${dbUsers.length} total users in database`);
      
      // Step 3: Match database users to Plex users using BOTH email fields
      console.log('\n🔄 Step 3: Matching database users to Plex access using both email and plex_email fields...');
      
      let updatedUsers = 0;
      let usersWithAccess = 0;
      let usersWithoutAccess = 0;
      
      for (const dbUser of dbUsers) {
        console.log(`\n👤 Processing database user: ${dbUser.name}`);
        
        // Check both email fields for matching
        const emailsToCheck = [];
        if (dbUser.email) emailsToCheck.push(dbUser.email.toLowerCase());
        if (dbUser.plex_email && dbUser.plex_email !== dbUser.email) {
          emailsToCheck.push(dbUser.plex_email.toLowerCase());
        }
        
        console.log(`📧 Checking emails: ${emailsToCheck.join(', ')}`);
        
        // Try to find user in Plex using either email
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
          // User found in Plex servers
          console.log(`✅ Found in Plex as: ${plexUserData.plexUsername} (matched email: ${matchedEmail})`);
          console.log(`📚 Server access:`, plexUserData.serverAccess);
          
          // Update their library access in database
          await db.query(`
            UPDATE users 
            SET plex_libraries = ?
            WHERE id = ?
          `, [JSON.stringify(plexUserData.serverAccess), dbUser.id]);
          
          // Count total libraries
          const totalLibraries = Object.values(plexUserData.serverAccess).reduce((total, group) => {
            return total + (group.regular?.length || 0) + (group.fourk?.length || 0);
          }, 0);
          
          console.log(`📊 Updated access: ${totalLibraries} total libraries across ${Object.keys(plexUserData.serverAccess).length} server groups`);
          
          // Detailed breakdown
          for (const [groupName, groupAccess] of Object.entries(plexUserData.serverAccess)) {
            console.log(`  📁 ${groupName}: ${groupAccess.regular?.length || 0} regular + ${groupAccess.fourk?.length || 0} 4K libraries`);
          }
          
          usersWithAccess++;
        } else {
          // User not found in any Plex server
          console.log(`❌ No access found in any Plex server for any email`);
          
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
      
      // Step 4: Report on Plex users not in our database
      console.log('\n📋 Step 4: Checking for Plex users not in our database...');
      const dbEmails = new Set();
      for (const dbUser of dbUsers) {
        if (dbUser.email) dbEmails.add(dbUser.email.toLowerCase());
        if (dbUser.plex_email) dbEmails.add(dbUser.plex_email.toLowerCase());
      }
      
      const plexOnlyUsers = [];
      
      for (const [email, userData] of allPlexUsers.entries()) {
        if (!dbEmails.has(email)) {
          plexOnlyUsers.push({ email, username: userData.plexUsername });
        }
      }
      
      if (plexOnlyUsers.length > 0) {
        console.log(`⚠️ Found ${plexOnlyUsers.length} users in Plex who are NOT in our database:`);
        for (const user of plexOnlyUsers) {
          console.log(`  👤 ${user.username} (${user.email})`);
        }
      } else {
        console.log(`✅ All Plex users are accounted for in our database`);
      }
      
      // Final summary
      console.log(`\n📈 User library access sync completed!`);
      console.log(`✅ Database users updated: ${updatedUsers}`);
      console.log(`📚 Users with Plex access: ${usersWithAccess}`);
      console.log(`❌ Users without Plex access: ${usersWithoutAccess}`);
      console.log(`⚠️ Plex users not in database: ${plexOnlyUsers.length}`);
      console.log(`📊 Total unique Plex users found: ${allPlexUsers.size}`);
      
    } catch (error) {
      console.error('❌ Error syncing user library access:', error);
      throw error;
    }
  }

  // Sync all libraries and store in database
  async syncAllLibraries() {
    try {
      console.log('🔄 Syncing Plex libraries using Plex.tv API...');
      
      const serverConfigs = this.getServerConfig();
      
      for (const [groupName, groupConfig] of Object.entries(serverConfigs)) {
        console.log(`📁 Syncing group: ${groupName}`);
        
        // Sync regular server libraries
        const regularLibs = await this.getServerLibraries(groupConfig.regular);
        await this.updateLibrariesInDatabase(groupName, 'regular', regularLibs);
        console.log(`✅ Synced ${regularLibs.length} regular libraries for ${groupName}`);
        
        // Use hardcoded 4K libraries
        const fourkLibs = groupConfig.fourk.libraries || [];
        await this.updateLibrariesInDatabase(groupName, 'fourk', fourkLibs);
        console.log(`✅ Using ${fourkLibs.length} hardcoded 4K libraries for ${groupName}`);
      }
      
      // Sync user access to match current state (IMPROVED METHOD)
      console.log('\n👥 Now syncing user library access using improved method...');
      await this.syncUserLibraryAccess();
      
      // Update the last sync timestamp
      await this.updateSyncTimestamp();
      
      console.log('\n🎉 Complete Plex sync finished successfully!');
      return { success: true, timestamp: new Date().toISOString() };
    } catch (error) {
      console.error('❌ Error syncing libraries:', error);
      return { success: false, error: error.message };
    }
  }

  // Update libraries in database
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

  // Get libraries from database for frontend
  async getLibrariesForGroup(serverGroup) {
    try {
      const serverConfigs = this.getServerConfig();
      const config = serverConfigs[serverGroup];
      
      if (!config) {
        throw new Error(`Invalid server group: ${serverGroup}`);
      }

      // Get regular server libraries from database
      const [regularLibsSetting] = await db.query(
        'SELECT setting_value FROM settings WHERE setting_key = ?',
        [`plex_libraries_${serverGroup}_regular`]
      );

      const regularLibs = regularLibsSetting 
        ? JSON.parse(regularLibsSetting.setting_value) 
        : [];

      // Get 4K libraries from database
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

  // Test server connection using Plex.tv API
  async testConnection(serverGroup) {
    try {
      const serverConfigs = this.getServerConfig();
      const config = serverConfigs[serverGroup];
      
      if (!config) {
        throw new Error(`Invalid server group: ${serverGroup}`);
      }

      // Test regular server via Plex.tv API
      await this.makePlexTvRequest(config.regular.serverId, config.regular.token, '');
      console.log(`✅ Regular server connection successful: ${config.regular.name}`);

      // Test 4K server via Plex.tv API
      await this.makePlexTvRequest(config.fourk.serverId, config.fourk.token, '');
      console.log(`✅ 4K server connection successful: ${config.fourk.name}`);

      return { success: true, message: `Connection successful for ${serverGroup}` };
    } catch (error) {
      console.error(`❌ Connection test failed for ${serverGroup}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  // Update the last sync timestamp in database
  async updateSyncTimestamp() {
    try {
      const now = new Date().toISOString();
      await db.query(`
        INSERT INTO settings (setting_key, setting_value, setting_type)
        VALUES ('last_plex_sync', ?, 'string')
        ON DUPLICATE KEY UPDATE setting_value = ?, updated_at = NOW()
      `, [now, now]);
      console.log('🕐 Updated last sync timestamp:', now);
    } catch (error) {
      console.error('❌ Error updating sync timestamp:', error);
    }
  }

  // Placeholder methods for sharing/removing (to be implemented later)
  async shareLibrariesWithUser(userEmail, serverGroup, libraryIds) {
    // TODO: Implement using Plex.tv API like your Python code
    console.log(`TODO: Share libraries with ${userEmail} on ${serverGroup}`, libraryIds);
    return { success: true, message: 'Sharing not implemented yet' };
  }

  async removeUserAccess(userEmail, serverGroups) {
    // TODO: Implement using Plex.tv API like your Python code
    console.log(`TODO: Remove access for ${userEmail} from`, serverGroups);
    return { success: true, message: 'Remove access not implemented yet' };
  }
}

module.exports = new PlexService();