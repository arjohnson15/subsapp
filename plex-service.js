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

  // Get user's shared libraries using Plex.tv API (like your Python code)
  async getUserSharedLibraries(userEmail, serverConfig) {
    try {
      console.log(`🔍 Checking shared libraries for ${userEmail} on ${serverConfig.name} (Server ID: ${serverConfig.serverId})`);
      
      const xmlData = await this.makePlexTvRequest(serverConfig.serverId, serverConfig.token, '/shared_servers');
      const result = await this.parser.parseStringPromise(xmlData);
      
      if (!result.MediaContainer || !result.MediaContainer.SharedServer) {
        console.log(`No shared servers found for ${serverConfig.name}`);
        return [];
      }

      const sharedServers = Array.isArray(result.MediaContainer.SharedServer)
        ? result.MediaContainer.SharedServer
        : [result.MediaContainer.SharedServer];

      // Find the shared server for this user by email
      const userSharedServer = sharedServers.find(server => server.$.email === userEmail);
      
      if (!userSharedServer) {
        console.log(`No shared libraries found for ${userEmail} on ${serverConfig.name}`);
        return [];
      }

      if (!userSharedServer.Section) {
        console.log(`User ${userEmail} has no sections on ${serverConfig.name}`);
        return [];
      }

      const sections = Array.isArray(userSharedServer.Section) 
        ? userSharedServer.Section 
        : [userSharedServer.Section];

      // Only get sections that are shared
      const sharedLibraries = sections
        .filter(section => section.$.shared === '1')
        .map(section => ({
          id: section.$.id,
          title: section.$.title,
          type: section.$.type
        }));
      
      console.log(`📚 User ${userEmail} has access to ${sharedLibraries.length} libraries on ${serverConfig.name}:`, 
        sharedLibraries.map(l => l.title));
      
      return sharedLibraries;
    } catch (error) {
      console.error(`Failed to get shared libraries for ${userEmail} on ${serverConfig.name}:`, error.message);
      return [];
    }
  }

  // Get user's current access across all servers
  async getUserCurrentAccess(userEmail) {
    try {
      console.log(`🔍 Getting current access for user: ${userEmail}`);
      
      const serverConfigs = this.getServerConfig();
      const access = {};
      
      for (const [groupName, groupConfig] of Object.entries(serverConfigs)) {
        console.log(`🔍 Checking ${groupName} access for ${userEmail}...`);
        
        // Get access for regular server
        const regularAccess = await this.getUserSharedLibraries(userEmail, groupConfig.regular);
        
        // Get access for 4K server (if it has real libraries)
        let fourkAccess = [];
        if (groupConfig.fourk.libraries) {
          // For hardcoded 4K libraries, check if user has any access to that server
          try {
            const fourkSharedLibraries = await this.getUserSharedLibraries(userEmail, groupConfig.fourk);
            // If user has any access to 4K server, give them the hardcoded libraries
            fourkAccess = fourkSharedLibraries.length > 0 ? groupConfig.fourk.libraries.map(lib => lib.id) : [];
          } catch (error) {
            console.log(`No 4K access found for ${userEmail} on ${groupName}`);
            fourkAccess = [];
          }
        }
        
        access[groupName] = {
          regular: regularAccess.map(lib => lib.id),
          fourk: fourkAccess
        };
        
        console.log(`📊 ${groupName} access for ${userEmail}:`, access[groupName]);
      }
      
      return access;
    } catch (error) {
      console.error('Error getting user current access:', error);
      return {};
    }
  }

  // Sync user library access with current Plex state
  async syncUserLibraryAccess() {
    try {
      console.log('🔄 Syncing user library access with Plex servers...');
      
      // Get all users with Plex emails
      const users = await db.query(`
        SELECT id, name, email, plex_email, tags, plex_libraries
        FROM users 
        WHERE plex_email IS NOT NULL AND plex_email != ''
      `);
      
      console.log(`Found ${users.length} users with Plex emails to sync`);
      
      let successfulSyncs = 0;
      let failedSyncs = 0;
      
      for (const user of users) {
        try {
          console.log(`\n👤 Syncing access for user: ${user.name} (${user.plex_email})`);
          
          // Parse user tags to determine which servers they should have access to
          let userTags = [];
          try {
            if (user.tags) {
              // Handle both JSON array format and comma-separated string format
              if (typeof user.tags === 'string') {
                if (user.tags.startsWith('[')) {
                  // JSON array format: ["Plex 1", "Plex 2", "IPTV"]
                  userTags = JSON.parse(user.tags);
                } else if (user.tags.includes(',')) {
                  // Comma-separated string format: "Plex 1,Plex 2,IPTV"
                  userTags = user.tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
                } else if (user.tags.trim().length > 0) {
                  // Single tag: "Plex 1"
                  userTags = [user.tags.trim()];
                }
              } else if (Array.isArray(user.tags)) {
                // Already an array
                userTags = user.tags;
              }
            }
          } catch (e) {
            console.log(`⚠️  Could not parse tags for ${user.name}: "${user.tags}", error: ${e.message}`);
            console.log(`📝 Attempting to continue with raw tag processing...`);
            
            // Fallback: try to extract tags anyway
            if (user.tags && typeof user.tags === 'string') {
              userTags = user.tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
            }
          }
          
          console.log(`🏷️ User ${user.name} has tags:`, userTags);
          
          // Only sync users who have Plex tags
          const plexTags = userTags.filter(tag => tag.toLowerCase().includes('plex'));
          if (plexTags.length === 0) {
            console.log(`⏭️  User ${user.name} has no Plex tags, skipping Plex sync`);
            continue;
          }
          
          console.log(`🎯 User ${user.name} has Plex tags:`, plexTags);
          
          // Get current access from Plex
          const currentAccess = await this.getUserCurrentAccess(user.plex_email);
          
          // Update user's plex_libraries in database with their current access
          await db.query(`
            UPDATE users 
            SET plex_libraries = ?
            WHERE id = ?
          `, [JSON.stringify(currentAccess), user.id]);
          
          console.log(`✅ Updated cached library access for ${user.name}`);
          
          // Log summary
          const totalLibraries = Object.values(currentAccess).reduce((total, group) => {
            return total + (group.regular?.length || 0) + (group.fourk?.length || 0);
          }, 0);
          
          console.log(`📊 ${user.name} has access to ${totalLibraries} total libraries across ${Object.keys(currentAccess).length} server groups`);
          
          // Detailed breakdown
          for (const [groupName, groupAccess] of Object.entries(currentAccess)) {
            console.log(`  📁 ${groupName}: ${groupAccess.regular?.length || 0} regular + ${groupAccess.fourk?.length || 0} 4K libraries`);
          }
          
          successfulSyncs++;
          
        } catch (userError) {
          console.error(`❌ Error syncing access for user ${user.name}:`, userError.message);
          failedSyncs++;
        }
      }
      
      console.log(`\n📈 User library access sync completed!`);
      console.log(`✅ Successful syncs: ${successfulSyncs}`);
      console.log(`❌ Failed syncs: ${failedSyncs}`);
      console.log(`📊 Total users processed: ${users.length}`);
      
    } catch (error) {
      console.error('❌ Error syncing user library access:', error);
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
      
      // Sync user access to match current state
      console.log('\n👥 Now syncing user library access...');
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