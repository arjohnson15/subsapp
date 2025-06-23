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

  // Make authenticated request to Plex API
  async makeRequest(url, token) {
    try {
      const response = await axios.get(url, {
        headers: {
          'X-Plex-Token': token,
          'Accept': 'application/xml'
        },
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      console.error('Plex API request failed:', error.message);
      throw error;
    }
  }

  // Get libraries from a specific Plex server
  async getServerLibraries(serverConfig) {
    try {
      const url = `${plexConfig.apiBase}/servers/${serverConfig.id}/library/sections`;
      const xmlData = await this.makeRequest(url, serverConfig.token);
      const result = await this.parser.parseStringPromise(xmlData);
      
      if (!result.MediaContainer || !result.MediaContainer.Directory) {
        return [];
      }

      const directories = Array.isArray(result.MediaContainer.Directory) 
        ? result.MediaContainer.Directory 
        : [result.MediaContainer.Directory];

      return directories.map(dir => ({
        id: dir.$.key || dir.$.id,
        title: dir.$.title,
        type: dir.$.type,
        agent: dir.$.agent
      }));
    } catch (error) {
      console.error(`Failed to get libraries for ${serverConfig.name}:`, error.message);
      return [];
    }
  }

  // Get user's current library access for a server
  async getUserLibraryAccess(userEmail, serverConfig) {
    try {
      const url = `${plexConfig.apiBase}/servers/${serverConfig.id}/shared_servers`;
      const xmlData = await this.makeRequest(url, serverConfig.token);
      const result = await this.parser.parseStringPromise(xmlData);
      
      if (!result.MediaContainer || !result.MediaContainer.SharedServer) {
        return [];
      }

      const sharedServers = Array.isArray(result.MediaContainer.SharedServer)
        ? result.MediaContainer.SharedServer
        : [result.MediaContainer.SharedServer];

      const userServer = sharedServers.find(server => server.$.email === userEmail);
      if (!userServer || !userServer.Section) {
        return [];
      }

      const sections = Array.isArray(userServer.Section) 
        ? userServer.Section 
        : [userServer.Section];

      return sections
        .filter(section => section.$.shared === '1')
        .map(section => ({
          id: section.$.id,
          title: section.$.title,
          type: section.$.type
        }));
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
      
      // Build the share URL
      const libraryParams = allLibraryIds.map(id => `librarySectionID=${id}`).join('&');
      const url = `${plexConfig.apiBase}/servers/${serverConfig.id}/shared_servers?${libraryParams}`;
      
      // Make the share request
      const postData = `invited_email=${encodeURIComponent(userEmail)}&settings[allowSync]=1&settings[allowCameraUpload]=0&settings[allowChannels]=0`;
      
      const response = await axios.post(url, postData, {
        headers: {
          'X-Plex-Token': serverConfig.token,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      return { 
        success: true, 
        message: `Libraries shared with ${userEmail}`,
        librariesShared: allLibraryIds.length
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
      const url = `${plexConfig.apiBase}/servers/${serverConfig.id}/shared_servers`;
      
      // Get current shared servers to find the user
      const xmlData = await this.makeRequest(url, serverConfig.token);
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

      // Remove the user
      const removeUrl = `${url}/${userServer.$.id}`;
      await axios.delete(removeUrl, {
        headers: { 'X-Plex-Token': serverConfig.token }
      });

      return { success: true, message: 'User removed successfully' };
    } catch (error) {
      console.error(`Error removing user from ${serverConfig.name}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  // Sync all libraries and store in database
  async syncAllLibraries() {
    try {
      console.log('Syncing Plex libraries...');
      
      for (const [groupName, groupConfig] of Object.entries(plexConfig.servers)) {
        // Sync regular server libraries
        const regularLibs = await this.getServerLibraries(groupConfig.regular);
        await this.updateLibrariesInDatabase(groupName, 'regular', regularLibs);
        
        console.log(`Synced ${regularLibs.length} libraries for ${groupConfig.regular.name}`);
      }
      
      console.log('Plex library sync completed');
      return { success: true };
    } catch (error) {
      console.error('Error syncing libraries:', error);
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

      // Get hardcoded 4K libraries
      const fourkLibs = config.fourk.libraries || [];

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
      const regularUrl = `${plexConfig.apiBase}/servers/${config.regular.id}`;
      await this.makeRequest(regularUrl, config.regular.token);

      // Test 4K server
      const fourkUrl = `${plexConfig.apiBase}/servers/${config.fourk.id}`;
      await this.makeRequest(fourkUrl, config.fourk.token);

      return { success: true, message: `Connection successful for ${serverGroup}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = new PlexService();