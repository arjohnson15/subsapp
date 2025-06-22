const axios = require('axios');
const db = require('./database-config');

class PlexService {
  constructor() {
    this.servers = new Map();
    this.initializeServers();
  }

  async initializeServers() {
    try {
      const servers = await db.query('SELECT * FROM plex_servers WHERE active = TRUE');
      servers.forEach(server => {
        this.servers.set(server.name, {
          url: server.url,
          token: server.token,
          libraries: server.libraries ? JSON.parse(server.libraries) : []
        });
      });
      console.log(`Initialized ${servers.length} Plex servers`);
    } catch (error) {
      console.error('Error initializing Plex servers:', error);
    }
  }

  async makeRequest(serverName, endpoint, method = 'GET', data = null) {
    try {
      const server = this.servers.get(serverName);
      if (!server) {
        throw new Error(`Server ${serverName} not found`);
      }

      const config = {
        method,
        url: `${server.url}${endpoint}`,
        headers: {
          'X-Plex-Token': server.token,
          'Accept': 'application/json'
        }
      };

      if (data) {
        config.data = data;
      }

      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error(`Plex API error for ${serverName}:`, error.response?.data || error.message);
      throw error;
    }
  }

  async testConnection(serverName) {
    try {
      const response = await this.makeRequest(serverName, '/');
      return {
        success: true,
        serverName: response.MediaContainer?.friendlyName || 'Unknown',
        version: response.MediaContainer?.version || 'Unknown'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getLibraries(serverName) {
    try {
      const response = await this.makeRequest(serverName, '/library/sections');
      const libraries = response.MediaContainer?.Directory || [];
      
      const formattedLibraries = libraries.map(lib => ({
        id: lib.key,
        title: lib.title,
        type: lib.type,
        agent: lib.agent,
        language: lib.language
      }));

      // Update database with latest libraries
      await db.query(
        'UPDATE plex_servers SET libraries = ?, last_sync = NOW() WHERE name = ?',
        [JSON.stringify(formattedLibraries), serverName]
      );

      // Update in-memory cache
      if (this.servers.has(serverName)) {
        this.servers.get(serverName).libraries = formattedLibraries;
      }

      return formattedLibraries;
    } catch (error) {
      console.error(`Error fetching libraries for ${serverName}:`, error);
      throw error;
    }
  }

  async getUsers(serverName) {
    try {
      const response = await this.makeRequest(serverName, '/accounts');
      const users = response.MediaContainer?.Account || [];
      
      return users.map(user => ({
        id: user.id,
        name: user.name,
        email: user.email,
        title: user.title,
        thumb: user.thumb
      }));
    } catch (error) {
      console.error(`Error fetching users for ${serverName}:`, error);
      throw error;
    }
  }

  async createUser(serverName, userData) {
    try {
      const { name, email, libraries } = userData;
      
      // Create user invitation
      const inviteResponse = await this.makeRequest(
        serverName,
        '/api/v2/shared_servers',
        'POST',
        {
          invited_email: email,
          settings: {
            allowSync: false,
            allowCameraUpload: false,
            allowChannels: false,
            filterMovies: '',
            filterTelevision: '',
            filterMusic: ''
          }
        }
      );

      if (libraries && libraries.length > 0) {
        // Set library access
        await this.setUserLibraryAccess(serverName, inviteResponse.id, libraries);
      }

      return {
        success: true,
        userId: inviteResponse.id,
        message: 'User created and invited successfully'
      };
    } catch (error) {
      console.error(`Error creating user on ${serverName}:`, error);
      throw error;
    }
  }

  async setUserLibraryAccess(serverName, userId, libraryIds) {
    try {
      const libraryParams = libraryIds.map(id => `librarySectionID=${id}`).join('&');
      
      await this.makeRequest(
        serverName,
        `/accounts/${userId}?${libraryParams}`,
        'PUT'
      );

      return { success: true, message: 'Library access updated' };
    } catch (error) {
      console.error(`Error setting library access for user ${userId}:`, error);
      throw error;
    }
  }

  async removeUser(serverName, userId) {
    try {
      await this.makeRequest(serverName, `/accounts/${userId}`, 'DELETE');
      return { success: true, message: 'User removed successfully' };
    } catch (error) {
      console.error(`Error removing user ${userId} from ${serverName}:`, error);
      throw error;
    }
  }

  async getUserLibraryAccess(serverName, userId) {
    try {
      const response = await this.makeRequest(serverName, `/accounts/${userId}`);
      const user = response.MediaContainer?.Account?.[0];
      
      if (!user) {
        throw new Error('User not found');
      }

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        libraries: user.Server?.[0]?.Section || []
      };
    } catch (error) {
      console.error(`Error fetching library access for user ${userId}:`, error);
      throw error;
    }
  }

  async syncAllLibraries() {
    try {
      const results = {};
      
      for (const [serverName] of this.servers) {
        try {
          results[serverName] = await this.getLibraries(serverName);
        } catch (error) {
          results[serverName] = { error: error.message };
        }
      }

      return results;
    } catch (error) {
      console.error('Error syncing all libraries:', error);
      throw error;
    }
  }

  async getServerStats(serverName) {
    try {
      const [statusResponse, librariesResponse] = await Promise.all([
        this.makeRequest(serverName, '/'),
        this.makeRequest(serverName, '/library/sections')
      ]);

      const status = statusResponse.MediaContainer;
      const libraries = librariesResponse.MediaContainer?.Directory || [];

      return {
        serverName: status.friendlyName,
        version: status.version,
        platform: status.platform,
        platformVersion: status.platformVersion,
        libraryCount: libraries.length,
        libraries: libraries.map(lib => ({
          title: lib.title,
          type: lib.type
        }))
      };
    } catch (error) {
      console.error(`Error fetching stats for ${serverName}:`, error);
      throw error;
    }
  }

  async addServer(name, url, token) {
    try {
      // Test connection first
      const tempServer = { url, token };
      this.servers.set('temp', tempServer);
      
      const testResult = await this.testConnection('temp');
      this.servers.delete('temp');
      
      if (!testResult.success) {
        throw new Error('Connection test failed: ' + testResult.error);
      }

      // Add to database
      await db.query(
        'INSERT INTO plex_servers (name, url, token, active) VALUES (?, ?, ?, TRUE)',
        [name, url, token]
      );

      // Add to memory
      this.servers.set(name, { url, token, libraries: [] });

      // Sync libraries
      await this.getLibraries(name);

      return { success: true, message: 'Server added successfully' };
    } catch (error) {
      console.error('Error adding server:', error);
      throw error;
    }
  }

  async removeServer(name) {
    try {
      await db.query('DELETE FROM plex_servers WHERE name = ?', [name]);
      this.servers.delete(name);
      
      return { success: true, message: 'Server removed successfully' };
    } catch (error) {
      console.error('Error removing server:', error);
      throw error;
    }
  }

  async updateServer(name, updates) {
    try {
      const { url, token, active } = updates;
      
      if (url || token) {
        // Test new connection if URL or token changed
        const testServer = {
          url: url || this.servers.get(name)?.url,
          token: token || this.servers.get(name)?.token
        };
        
        this.servers.set('temp', testServer);
        const testResult = await this.testConnection('temp');
        this.servers.delete('temp');
        
        if (!testResult.success) {
          throw new Error('Connection test failed: ' + testResult.error);
        }
      }

      // Update database
      const updateFields = [];
      const updateValues = [];
      
      if (url) {
        updateFields.push('url = ?');
        updateValues.push(url);
      }
      if (token) {
        updateFields.push('token = ?');
        updateValues.push(token);
      }
      if (typeof active === 'boolean') {
        updateFields.push('active = ?');
        updateValues.push(active);
      }
      
      updateValues.push(name);
      
      await db.query(
        `UPDATE plex_servers SET ${updateFields.join(', ')} WHERE name = ?`,
        updateValues
      );

      // Update memory
      if (this.servers.has(name)) {
        const server = this.servers.get(name);
        if (url) server.url = url;
        if (token) server.token = token;
      }

      // Re-sync libraries if connection details changed
      if (url || token) {
        await this.getLibraries(name);
      }

      return { success: true, message: 'Server updated successfully' };
    } catch (error) {
      console.error('Error updating server:', error);
      throw error;
    }
  }

  getServerList() {
    return Array.from(this.servers.keys());
  }

  async getServerInfo(name) {
    try {
      const [serverData] = await db.query('SELECT * FROM plex_servers WHERE name = ?', [name]);
      if (!serverData) {
        throw new Error('Server not found');
      }

      return {
        ...serverData,
        libraries: serverData.libraries ? JSON.parse(serverData.libraries) : []
      };
    } catch (error) {
      console.error(`Error fetching server info for ${name}:`, error);
      throw error;
    }
  }
}

module.exports = new PlexService();