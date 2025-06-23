const axios = require('axios');
const xml2js = require('xml2js');
const db = require('./database-config');
const plexConfig = require('./plex-config');

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
    }, plexConfig.syncInterval);
  }

  // Make authenticated request to Plex server DIRECTLY using individual server URLs
  async makeRequest(serverConfig, path = '') {
    try {
      // Use the individual server's URL from config
      const url = `${serverConfig.url}${path}`;
      
      console.log(`Making request to: ${url}`);
      
      const response = await axios.get(url, {
        headers: {
          'X-Plex-Token': serverConfig.token,
          'Accept': 'application/xml'
        },
        timeout: plexConfig.timeout || 10000
      });
      return response.data;
    } catch (error) {
      console.error(`Plex server request failed for ${serverConfig.url}${path}:`, error.message);
      throw error;
    }
  }

  // Get libraries from a specific Plex server
  async getServerLibraries(serverConfig) {
    try {
      console.log(`Fetching libraries from ${serverConfig.name} at ${serverConfig.url}`);
      
      const xmlData = await this.makeRequest(serverConfig, '/library/sections');
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

  // Get user's current library access for a server
  async getUserLibraryAccess(userEmail, serverConfig) {
    try {
      console.log(`🔍 Checking access for ${userEmail} on ${serverConfig.name}`);
      
      const xmlData = await this.makeRequest(serverConfig, '/myplex/shared_servers');
      const result = await this.parser.parseStringPromise(xmlData);
      
      if (!result.MediaContainer || !result.MediaContainer.SharedServer) {
        console.log(`No shared servers found on ${serverConfig.name}`);
        return [];
      }

      const sharedServers = Array.isArray(result.MediaContainer.SharedServer)
        ? result.MediaContainer.SharedServer
        : [result.MediaContainer.SharedServer];

      const userServer = sharedServers.find(server => server.$.email === userEmail);
      if (!userServer || !userServer.Section) {
        console.log(`User ${userEmail} not found or has no sections on ${serverConfig.name}`);
        return [];
      }

      const sections = Array.isArray(userServer.Section) 
        ? userServer.Section 
        : [userServer.Section];

      const accessibleLibraries = sections
        .filter(section => section.$.shared === '1')
        .map(section => ({
          id: section.$.id,
          title: section.$.title,
          type: section.$.type
        }));
      
      console.log(`✅ User ${userEmail} has access to ${accessibleLibraries.length} libraries on ${serverConfig.name}:`, 
        accessibleLibraries.map(l => l.title));
      
      return accessibleLibraries;
    } catch (error) {
      console.error(`Failed to get user access for ${userEmail} on ${serverConfig.name}:`, error.message);
      return [];
    }
  }

  // Share libraries with a user
  async shareLibrariesWithUser(userEmail, serverGroup, libraryIds) {
    try {
      const results = [];
      const config = plexConfig.servers[serverGroup];
      
      if (!config) {
        throw new Error(`Invalid server group: ${serverGroup}`);
      }

      // Handle regular server libraries
      if (libraryIds.regular && libraryIds.regular.length > 0) {
        const shareResult = await this.shareLibrariesOnServer(
          userEmail, 
          config.regular, 
          libraryIds.regular
        );
        results.push({ server: config.regular.name, ...shareResult });
      }

      // Handle 4K server libraries
      if (libraryIds.fourk && libraryIds.fourk.length > 0) {
        const shareResult = await this.shareLibrariesOnServer(
          userEmail, 
          config.fourk, 
          libraryIds.fourk
        );
        results.push({ server: config.fourk.name, ...shareResult });
      }

      return { success: true, results };
    } catch (error) {
      console.error('Error sharing libraries:', error);
      return { success: false, error: error.message };
    }
  }

  // Share libraries on a specific server
  async shareLibrariesOnServer(userEmail, serverConfig, libraryIds) {
    try {
      // First, check if user already has access
      const currentAccess = await this.getUserLibraryAccess(userEmail, serverConfig);
      const currentLibraryIds = currentAccess.map(lib => lib.id);
      
      // Combine current access with new libraries (avoid duplicates)
      const allLibraryIds = [...new Set([...currentLibraryIds, ...libraryIds])];
      
      console.log(`📤 Sharing libraries on ${serverConfig.name} with ${userEmail}:`, 
        { current: currentLibraryIds, new: libraryIds, all: allLibraryIds });
      
      // Build the share URL for direct server connection
      const libraryParams = allLibraryIds.map(id => `librarySectionID=${id}`).join('&');
      const path = `/myplex/shared_servers?${libraryParams}`;
      
      // Make the share request to server directly
      const postData = `invited_email=${encodeURIComponent(userEmail)}&settings[allowSync]=1&settings[allowCameraUpload]=0&settings[allowChannels]=0`;
      
      const response = await axios.post(`${serverConfig.url}${path}`, postData, {
        headers: {
          'X-Plex-Token': serverConfig.token,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      console.log(`✅ Successfully shared libraries with ${userEmail} on ${serverConfig.name}`);

      return { 
        success: true, 
        message: `Libraries shared with ${userEmail}`,
        librariesShared: allLibraryIds.length,
        newLibrariesAdded: allLibraryIds.length - currentLibraryIds.length
      };
    } catch (error) {
      console.error(`Error sharing libraries on ${serverConfig.name}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  // Remove user access from servers
  async removeUserAccess(userEmail, serverGroups) {
    try {
      const results = [];
      
      for (const serverGroup of serverGroups) {
        const config = plexConfig.servers[serverGroup];
        if (!config) continue;

        // Remove from regular server
        const regularResult = await this.removeUserFromServer(userEmail, config.regular);
        results.push({ server: config.regular.name, ...regularResult });

        // Remove from 4K server
        const fourkResult = await this.removeUserFromServer(userEmail, config.fourk);
        results.push({ server: config.fourk.name, ...fourkResult });
      }

      return { success: true, results };
    } catch (error) {
      console.error('Error removing user access:', error);
      return { success: false, error: error.message };
    }
  }

  // Remove user from a specific server
  async removeUserFromServer(userEmail, serverConfig) {
    try {
      // Get current shared servers to find the user
      const xmlData = await this.makeRequest(serverConfig, '/myplex/shared_servers');
      const result = await this.parser.parseStringPromise(xmlData);
      
      if (!result.MediaContainer || !result.MediaContainer.SharedServer) {
        return { success: true, message: 'User not found on server' };
      }

      const sharedServers = Array.isArray(result.MediaContainer.SharedServer)
        ? result.MediaContainer.SharedServer
        : [result.MediaContainer.SharedServer];

      const userServer = sharedServers.find(server => server.$.email === userEmail);
      if (!userServer) {
        return { success: true, message: 'User not found on server' };
      }

      // Remove the user using direct server connection
      const removeUrl = `${serverConfig.url}/myplex/shared_servers/${userServer.$.id}`;
      await axios.delete(removeUrl, {
        headers: { 'X-Plex-Token': serverConfig.token }
      });

      return { success: true, message: 'User removed successfully' };
    } catch (error) {
      console.error(`Error removing user from ${serverConfig.name}:`, error.message);
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
      console.log('✅ Updated last sync timestamp:', now);
    } catch (error) {
      console.error('❌ Error updating sync timestamp:', error);
    }
  }

  // NEW: Comprehensive user library access sync
  async syncUserLibraryAccess() {
    try {
      console.log('🔄 Syncing user library access with Plex servers...');
      
      // Get all users with Plex emails and tags
      const users = await db.query(`
        SELECT id, name, email, plex_email, tags, plex_libraries
        FROM users 
        WHERE plex_email IS NOT NULL AND plex_email != ''
      `);
      
      console.log(`Found ${users.length} users with Plex emails to sync`);
      
      for (const user of users) {
        try {
          console.log(`\n🔍 Syncing access for user: ${user.name} (${user.plex_email})`);
          
          // Parse user tags to determine which servers they should have access to
          let userTags = [];
          try {
            userTags = JSON.parse(user.tags || '[]');
          } catch (e) {
            console.log(`⚠️  Could not parse tags for ${user.name}, skipping`);
            continue;
          }
          
          console.log(`👤 User ${user.name} has tags:`, userTags);
          
          const currentAccess = {};
          
          // Check access for each server group based on user's tags
          for (const [groupName, groupConfig] of Object.entries(plexConfig.servers)) {
            const hasAccess = userTags.includes(`Plex 1`) && groupName === 'plex1' ||
                            userTags.includes(`Plex 2`) && groupName === 'plex2';
            
            if (hasAccess) {
              console.log(`📡 Checking ${groupName} access for ${user.name}...`);
              
              // Get access for regular server
              const regularAccess = await this.getUserLibraryAccess(user.plex_email, groupConfig.regular);
              
              // Get access for 4K server 
              const fourkAccess = await this.getUserLibraryAccess(user.plex_email, groupConfig.fourk);
              
              currentAccess[groupName] = {
                regular: regularAccess.map(lib => lib.id),
                fourk: fourkAccess.map(lib => lib.id)
              };
              
              console.log(`📊 Current ${groupName} access:`, currentAccess[groupName]);
            } else {
              console.log(`⏭️  User ${user.name} doesn't have ${groupName} tag, skipping`);
            }
          }
          
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
          
          console.log(`📋 ${user.name} has access to ${totalLibraries} total libraries across ${Object.keys(currentAccess).length} server groups`);
          
        } catch (userError) {
          console.error(`❌ Error syncing access for user ${user.name}:`, userError.message);
        }
      }
      
      console.log('\n✅ User library access sync completed successfully!');
    } catch (error) {
      console.error('❌ Error syncing user library access:', error);
    }
  }

  // Sync all libraries and store in database
  async syncAllLibraries() {
    try {
      console.log('🔄 Syncing Plex libraries using direct server connections...');
      
      for (const [groupName, groupConfig] of Object.entries(plexConfig.servers)) {
        console.log(`🔄 Syncing group: ${groupName}`);
        
        // Sync regular server libraries
        const regularLibs = await this.getServerLibraries(groupConfig.regular);
        await this.updateLibrariesInDatabase(groupName, 'regular', regularLibs);
        console.log(`✅ Synced ${regularLibs.length} regular libraries for ${groupName}`);
        
        // Use hardcoded 4K libraries instead of syncing them
        const fourkLibs = groupConfig.fourk.libraries || [];
        await this.updateLibrariesInDatabase(groupName, 'fourk', fourkLibs);
        console.log(`✅ Using ${fourkLibs.length} hardcoded 4K libraries for ${groupName}`);
      }
      
      // IMPORTANT: After syncing libraries, sync user access to match current state
      console.log('\n🔄 Now syncing user library access...');
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
      const config = plexConfig.servers[serverGroup];
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

  // Get user's current access across all servers
  async getUserCurrentAccess(userEmail) {
    try {
      const access = {};
      
      for (const [groupName, groupConfig] of Object.entries(plexConfig.servers)) {
        // Get access for regular server
        const regularAccess = await this.getUserLibraryAccess(userEmail, groupConfig.regular);
        
        // Get access for 4K server
        const fourkAccess = await this.getUserLibraryAccess(userEmail, groupConfig.fourk);
        
        access[groupName] = {
          regular: regularAccess.map(lib => lib.id),
          fourk: fourkAccess.map(lib => lib.id)
        };
      }
      
      return access;
    } catch (error) {
      console.error('Error getting user current access:', error);
      return {};
    }
  }

  // Test server connection
  async testConnection(serverGroup) {
    try {
      const config = plexConfig.servers[serverGroup];
      if (!config) {
        throw new Error(`Invalid server group: ${serverGroup}`);
      }

      // Test regular server
      await this.makeRequest(config.regular, '/');
      console.log(`✅ Regular server connection successful: ${config.regular.url}`);

      // Test 4K server
      await this.makeRequest(config.fourk, '/');
      console.log(`✅ 4K server connection successful: ${config.fourk.url}`);

      return { success: true, message: `Connection successful for ${serverGroup}` };
    } catch (error) {
      console.error(`❌ Connection test failed for ${serverGroup}:`, error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new PlexService();