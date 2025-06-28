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
    
    console.log('✅ Plex sync scheduled - will run every hour');
  }

  // FIXED: Safe version that won't crash the app
  async syncAllLibrariesSafely() {
    try {
      await this.syncAllLibraries();
    } catch (error) {
      console.error('❌ Scheduled Plex sync failed (non-fatal):', error.message);
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
      console.log(`🌐 Plex.tv API request to: ${url}`);
      
      const response = await axios.get(url, {
        headers: {
          'X-Plex-Token': token,
          'Accept': 'application/xml'
        },
        timeout: 10000
      });
      
      return response.data;
    } catch (error) {
      console.error(`❌ Plex.tv API request failed for ${endpoint}:`, error.message);
      throw error;
    }
  }

  // FIXED: Get server libraries with better error handling and direct server fallback
  async getServerLibraries(serverConfig) {
    try {
      console.log(`📚 Fetching libraries for ${serverConfig.name}...`);
      
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
          
          console.log(`✅ Found ${libraries.length} libraries via Plex.tv API for ${serverConfig.name}`);
          return libraries;
        }
      } catch (error) {
        console.log(`⚠️ Plex.tv API failed for ${serverConfig.name}, trying direct server connection...`);
      }
      
      // OPTION 2: Try direct server connection as fallback
      try {
        const directUrl = `${serverConfig.url}/library/sections`;
        console.log(`🔗 Trying direct connection: ${directUrl}`);
        
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
          
          console.log(`✅ Found ${libraries.length} libraries via direct connection for ${serverConfig.name}`);
          return libraries;
        }
      } catch (error) {
        console.log(`⚠️ Direct server connection also failed for ${serverConfig.name}: ${error.message}`);
      }
      
      // OPTION 3: Return hardcoded fallback libraries
      console.log(`⚠️ Both API methods failed, using hardcoded fallback libraries for ${serverConfig.name}`);
      return [
        { id: '1', title: 'Movies', type: 'movie' },
        { id: '2', title: 'TV Shows', type: 'show' },
        { id: '3', title: 'Music', type: 'artist' }
      ];
      
    } catch (error) {
      console.error(`❌ Error fetching libraries for ${serverConfig.name}:`, error.message);
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

      console.log(`📚 Getting libraries for ${serverGroup}...`);

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
          console.log(`📖 Found ${regularLibs.length} regular libraries in database for ${serverGroup}`);
        } catch (parseError) {
          console.log(`⚠️ Could not parse regular libraries from database for ${serverGroup}`);
          regularLibs = [];
        }
      }

      // Parse 4K libraries from database (but fall back to hardcoded)
      if (fourkLibsSetting && fourkLibsSetting.setting_value) {
        try {
          const parsedFourkLibs = JSON.parse(fourkLibsSetting.setting_value);
          if (parsedFourkLibs && parsedFourkLibs.length > 0) {
            fourkLibs = parsedFourkLibs;
            console.log(`📖 Found ${fourkLibs.length} 4K libraries in database for ${serverGroup}`);
          }
        } catch (parseError) {
          console.log(`⚠️ Could not parse 4K libraries from database for ${serverGroup}, using hardcoded`);
        }
      }

      // FIXED: If no regular libraries in database, try to fetch from API
      if (!regularLibs || regularLibs.length === 0) {
        console.log(`📚 No regular libraries in database for ${serverGroup}, trying to fetch from API...`);
        try {
          regularLibs = await this.getServerLibraries(config.regular);
          
          // Store in database for next time
          if (regularLibs && regularLibs.length > 0) {
            await this.updateLibrariesInDatabase(serverGroup, 'regular', regularLibs);
            console.log(`✅ Fetched and stored ${regularLibs.length} regular libraries for ${serverGroup}`);
          }
        } catch (error) {
          console.error(`❌ Failed to fetch libraries from API for ${serverGroup}:`, error.message);
          // Use fallback libraries
          regularLibs = [
            { id: '1', title: 'Movies', type: 'movie' },
            { id: '2', title: 'TV Shows', type: 'show' },
            { id: '3', title: 'Music', type: 'artist' }
          ];
          console.log(`⚠️ Using fallback libraries for ${serverGroup}`);
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

      console.log(`✅ Returning ${result.regular.length} regular + ${result.fourk.length} 4K libraries for ${serverGroup}`);
      return result;
      
    } catch (error) {
      console.error(`❌ Error getting libraries for group ${serverGroup}:`, error.message);
      
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
      console.log(`✅ Regular server connection successful: ${config.regular.name}`);

      await this.makePlexTvRequest(config.fourk.serverId, config.fourk.token, '');
      console.log(`✅ 4K server connection successful: ${config.fourk.name}`);

      return { 
        success: true, 
        message: `Both servers for ${serverGroup} are accessible`,
        regular: config.regular.name,
        fourk: config.fourk.name
      };
    } catch (error) {
      console.error(`❌ Connection test failed for ${serverGroup}:`, error.message);
      throw error;
    }
  }

  // Get all shared users from a specific server using Python
  async getAllSharedUsersFromServer(serverConfig) {
    try {
      const result = await pythonPlexService.getSharedUsers(serverConfig);
      return result.users || [];
    } catch (error) {
      console.error(`Error getting shared users from ${serverConfig.name}:`, error);
      return [];
    }
  }

  // Get user's current access across all servers using Python
  async getUserCurrentAccess(userEmail) {
    try {
      console.log(`🔍 Getting current access for: ${userEmail}`);
      
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
      
      console.log(`✅ Current access for ${userEmail}:`, result);
      return result;
    } catch (error) {
      console.error('Error getting user current access:', error);
      return {};
    }
  }

  // Share libraries using Python script
  async shareLibrariesWithUser(userEmail, serverGroup, libraries) {
    try {
      console.log(`🔄 Sharing libraries with ${userEmail} on ${serverGroup}`);
      console.log(`📚 Libraries to share:`, libraries);
      
      const serverConfigs = this.getServerConfig();
      const config = serverConfigs[serverGroup];
      
      if (!config) {
        throw new Error(`Invalid server group: ${serverGroup}`);
      }

      const results = {};
      let totalChanges = 0;

      // Share regular libraries
      if (libraries.regular && libraries.regular.length > 0) {
        const regularResult = await pythonPlexService.shareLibraries(
          userEmail,
          config.regular,
          libraries.regular
        );
        results.regular = regularResult;
        if (regularResult.success) totalChanges++;
      }

      // Share 4K libraries
      if (libraries.fourk && libraries.fourk.length > 0) {
        const fourkResult = await pythonPlexService.shareLibraries(
          userEmail,
          config.fourk,
          libraries.fourk
        );
        results.fourk = fourkResult;
        if (fourkResult.success) totalChanges++;
      }

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
      console.log(`🔍 Checking pending invites for: ${userEmail}`);
      
      const result = await pythonPlexService.checkInviteStatus(userEmail);
      
      if (!result.success) {
        console.log(`⚠️ Failed to check invites for ${userEmail}`);
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
      
      console.log(`📋 Pending invites for ${userEmail}:`, Object.keys(pendingInvites).length > 0 ? pendingInvites : 'None');
      
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

  // Update sync timestamp
  async updateSyncTimestamp() {
    try {
      const timestamp = new Date().toISOString();
      await db.query(`
        INSERT INTO settings (setting_key, setting_value, setting_type)
        VALUES ('last_plex_sync', ?, 'datetime')
        ON DUPLICATE KEY UPDATE setting_value = ?, updated_at = NOW()
      `, [timestamp, timestamp]);
    } catch (error) {
      console.error('Error updating sync timestamp:', error);
    }
  }

  // Remove user from Plex using Python
  async removeUserFromPlex(userEmail, serverGroup) {
    try {
      console.log(`🗑️ Removing ${userEmail} from ${serverGroup}`);
      
      const serverConfigs = this.getServerConfig();
      const config = serverConfigs[serverGroup];
      
      if (!config) {
        throw new Error(`Invalid server group: ${serverGroup}`);
      }

      const results = {};
      
      // Remove from regular server
      try {
        const regularResult = await pythonPlexService.removeUser(userEmail, config.regular);
        results.regular = regularResult;
      } catch (error) {
        results.regular = { success: false, error: error.message };
      }
      
      // Remove from 4K server
      try {
        const fourkResult = await pythonPlexService.removeUser(userEmail, config.fourk);
        results.fourk = fourkResult;
      } catch (error) {
        results.fourk = { success: false, error: error.message };
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
}

module.exports = new PlexService(); pending invites:', error);
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
        timestamp: new Date().toISOString(),
        message: 'All Plex libraries and user access synced successfully'
      };
      
    } catch (error) {
      console.error('❌ Error syncing all libraries:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Sync user library access (enhanced version)
  async syncUserLibraryAccess() {
    try {
      console.log('\n🔄 Syncing user library access...');
      
      // Get all users from database who have Plex access
      const users = await db.query(`
        SELECT id, name, email, plex_email, tags, plex_libraries
        FROM users 
        WHERE plex_email IS NOT NULL AND plex_email != ''
      `);
      
      console.log(`📊 Found ${users.length} users with Plex access to sync`);
      
      // Get all Plex users from all servers
      const serverConfigs = this.getServerConfig();
      const allPlexUsers = new Map();
      
      for (const [groupName, groupConfig] of Object.entries(serverConfigs)) {
        console.log(`📡 Getting shared users from ${groupName}...`);
        
        // Get users from regular server
        const regularUsers = await this.getAllSharedUsersFromServer(groupConfig.regular);
        for (const user of regularUsers) {
          const email = user.email.toLowerCase();
          if (!allPlexUsers.has(email)) {
            allPlexUsers.set(email, { groups: {} });
          }
          allPlexUsers.get(email).groups[groupName] = allPlexUsers.get(email).groups[groupName] || {};
          allPlexUsers.get(email).groups[groupName].regular = user.libraries;
        }
        
        // Get users from 4K server
        const fourkUsers = await this.getAllSharedUsersFromServer(groupConfig.fourk);
        for (const user of fourkUsers) {
          const email = user.email.toLowerCase();
          if (!allPlexUsers.has(email)) {
            allPlexUsers.set(email, { groups: {} });
          }
          allPlexUsers.get(email).groups[groupName] = allPlexUsers.get(email).groups[groupName] || {};
          allPlexUsers.get(email).groups[groupName].fourk = user.libraries;
        }
      }
      
      let updatedUsers = 0;
      let usersWithAccess = 0;
      let usersWithoutAccess = 0;
      
      // Update each database user
      for (const dbUser of users) {
        const emailsToCheck = [dbUser.plex_email, dbUser.email].filter(Boolean);
        
        let foundPlexUser = null;
        for (const email of emailsToCheck) {
          foundPlexUser = allPlexUsers.get(email.toLowerCase());
          if (foundPlexUser) break;
        }
        
        if (foundPlexUser) {
          console.log(`✅ FOUND: ${dbUser.name} (${emailsToCheck.join(', ')}) in Plex servers`);
          
          // Build library access object
          const libraryAccess = foundPlexUser.groups;
          
          // Determine tags based on their access
          const uniqueTags = new Set();
          for (const [groupName, groupAccess] of Object.entries(libraryAccess)) {
            if (groupAccess.regular && groupAccess.regular.length > 0) {
              uniqueTags.add(`Plex ${groupName.slice(-1)}`); // "Plex 1" or "Plex 2"
            }
          }
          
          // Update database
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
      console.error('❌ Error syncing