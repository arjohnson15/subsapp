const express = require('express');
const router = express.Router();
const db = require('./database-config');
const axios = require('axios');
const { spawn } = require('child_process');
const iptvService = require('./iptv-service');
const xml2js = require('xml2js');

// GET /api/dashboard/stats - Combined endpoint for all dashboard data
router.get('/stats', async (req, res) => {
  try {
    console.log('📊 Loading comprehensive dashboard statistics...');
    
    const [userStats, iptvStats, plexStats] = await Promise.allSettled([
      getUserStats(),
      getIPTVStats(), 
      getPlexStats()
    ]);
    
    res.json({
      users: userStats.status === 'fulfilled' ? userStats.value : getDefaultUserStats(),
      iptv: iptvStats.status === 'fulfilled' ? iptvStats.value : getDefaultIPTVStats(),
      plex: plexStats.status === 'fulfilled' ? plexStats.value : getDefaultPlexStats()
    });
    
  } catch (error) {
    console.error('Error loading dashboard stats:', error);
    res.status(500).json({ error: 'Failed to load dashboard statistics' });
  }
});

// GET /api/dashboard/user-stats - User statistics only
router.get('/user-stats', async (req, res) => {
  try {
    const stats = await getUserStats();
    res.json(stats);
  } catch (error) {
    console.error('Error loading user stats:', error);
    res.status(500).json({ error: 'Failed to load user statistics' });
  }
});

// GET /api/dashboard/iptv-stats - IPTV content statistics 
router.get('/iptv-stats', async (req, res) => {
  try {
    const stats = await getIPTVStats();
    res.json(stats);
  } catch (error) {
    console.error('Error loading IPTV stats:', error);
    res.json(getDefaultIPTVStats());
  }
});

// GET /api/dashboard/plex-stats - Plex content statistics
router.get('/plex-stats', async (req, res) => {
  try {
    const stats = await getPlexStats();
    res.json(stats);
  } catch (error) {
    console.error('Error loading Plex stats:', error);
    res.json(getDefaultPlexStats());
  }
});

// POST /api/dashboard/refresh-cache - Force refresh cached statistics
router.post('/refresh-cache', async (req, res) => {
  try {
    console.log('🔄 Forcing cache refresh...');
    
    // Clear cache timestamps to force fresh data
    await db.query(
      `UPDATE settings SET setting_value = '' 
       WHERE setting_key IN ('plex_stats_last_update', 'iptv_stats_last_update')`
    );
    
    // Get fresh stats (this will cache them)
    const [userStats, iptvStats, plexStats] = await Promise.allSettled([
      getUserStats(),
      getIPTVStats(), 
      getPlexStats()
    ]);
    
    res.json({
      success: true,
      message: 'Cache refreshed successfully',
      timestamp: new Date().toISOString(),
      stats: {
        users: userStats.status === 'fulfilled' ? userStats.value : getDefaultUserStats(),
        iptv: iptvStats.status === 'fulfilled' ? iptvStats.value : getDefaultIPTVStats(),
        plex: plexStats.status === 'fulfilled' ? plexStats.value : getDefaultPlexStats()
      }
    });
    
  } catch (error) {
    console.error('Error refreshing cache:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to refresh cache',
      message: error.message 
    });
  }
});

// POST /api/dashboard/refresh-iptv-token - Force refresh IPTV token
router.post('/refresh-iptv-token', async (req, res) => {
  try {
    console.log('🔧 Manual IPTV token refresh requested...');
    
    const iptvService = require('./iptv-service');
    const success = await iptvService.forceRefreshToken();
    
    if (success) {
      res.json({
        success: true,
        message: 'IPTV token refreshed successfully',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to refresh IPTV token'
      });
    }
    
  } catch (error) {
    console.error('❌ Manual token refresh failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/dashboard/live-data - Real-time viewing data 
router.get('/live-data', async (req, res) => {
  try {
    console.log('🔴 Loading real-time viewing data...');
    
    const [iptvLiveData, plexNowPlaying] = await Promise.allSettled([
      getIPTVLiveViewers(),
      getPlexNowPlaying()
    ]);
    
    res.json({
      iptv: iptvLiveData.status === 'fulfilled' ? iptvLiveData.value : { viewers: [], total: 0 },
      plex: plexNowPlaying.status === 'fulfilled' ? plexNowPlaying.value : { sessions: [], total: 0 }
    });
    
  } catch (error) {
    console.error('Error loading live data:', error);
    res.status(500).json({ error: 'Failed to load live data' });
  }
});

// GET /api/dashboard/iptv-live - IPTV live streaming data only
router.get('/iptv-live', async (req, res) => {
  try {
    const liveData = await getIPTVLiveViewers();
    res.json(liveData);
  } catch (error) {
    console.error('Error loading IPTV live data:', error);
    res.json({ viewers: [], total: 0, error: 'Failed to load IPTV live data' });
  }
});

// GET /api/dashboard/plex-now-playing - Plex now playing sessions only  
router.get('/plex-now-playing', async (req, res) => {
  try {
    const nowPlaying = await getPlexNowPlaying();
    res.json(nowPlaying);
  } catch (error) {
    console.error('Error loading Plex now playing:', error);
    res.json({ sessions: [], total: 0, error: 'Failed to load Plex sessions' });
  }
});

// Helper function to get user statistics from database
async function getUserStats() {
  try {
    console.log('📊 Collecting user statistics...');
    
    // Get all users with their tags - FIXED QUERY
    const [users] = await db.query(`
      SELECT tags
      FROM users 
      WHERE tags IS NOT NULL AND tags != '[]' AND tags != ''
    `);
    
    let totalUsers = 0;
    let plex1Users = 0;
    let plex2Users = 0;
    let iptvUsers = 0;
    
    // Process each user's tags
    for (const user of users) {
      let userTags = [];
      
      try {
        // Handle different tag formats
        if (typeof user.tags === 'string') {
          userTags = JSON.parse(user.tags);
        } else if (Array.isArray(user.tags)) {
          userTags = user.tags;
        }
        
        // Check if user has any service tags
        const hasAnyService = userTags.some(tag => 
          tag === 'Plex 1' || tag === 'Plex 2' || tag === 'IPTV'
        );
        
        if (hasAnyService) {
          totalUsers++;
          
          // Count specific services
          if (userTags.includes('Plex 1')) plex1Users++;
          if (userTags.includes('Plex 2')) plex2Users++;
          if (userTags.includes('IPTV')) iptvUsers++;
        }
        
      } catch (e) {
        console.warn(`⚠️ Could not parse tags for user:`, user.tags);
      }
    }
    
    console.log(`✅ User stats: ${totalUsers} total, ${plex1Users} Plex1, ${plex2Users} Plex2, ${iptvUsers} IPTV`);
    
    return {
      total: totalUsers,
      plex1: plex1Users,
      plex2: plex2Users,
      iptv: iptvUsers,
      totalSubscriptions: plex1Users + plex2Users + iptvUsers
    };
    
  } catch (error) {
    console.error('❌ Error getting user stats:', error);
    return getDefaultUserStats();
  }
}

// Helper function to get IPTV statistics from IPTV Editor API
async function getIPTVStats() {
  try {
    console.log('📊 Collecting IPTV content statistics...');
    
    // Get default playlist from settings
    const [playlistSetting] = await db.query(
      'SELECT setting_value FROM settings WHERE setting_key = ?',
      ['iptv_default_playlist']
    );
    
    if (!playlistSetting || !playlistSetting.setting_value) {
      console.log('⚠️ No IPTV playlist configured');
      return getDefaultIPTVStats();
    }
    
    // Get IPTV Editor bearer token
    const [tokenSetting] = await db.query(
      'SELECT setting_value FROM settings WHERE setting_key = ?',
      ['iptv_bearer_token']  
    );
    
    if (!tokenSetting || !tokenSetting.setting_value) {
      console.log('⚠️ No IPTV bearer token configured');
      return getDefaultIPTVStats();
    }
    
    console.log(`🔗 Calling IPTV Editor API for playlist: ${playlistSetting.setting_value}`);
    
    // Call IPTV Editor API to get current stats
    const response = await axios.post('https://editor.iptveditor.com/api/playlist/reload-playlist', {
      playlist: playlistSetting.setting_value
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenSetting.setting_value}`,
        'Origin': 'https://cloud.iptveditor.com'
      },
      timeout: 15000
    });
    
    const data = response.data;
    console.log(`✅ IPTV stats: ${data.channel || 0} channels, ${data.movie || 0} movies, ${data.series || 0} series`);
    
    return {
      channels: data.channel || 0,
      movies: data.movie || 0, 
      series: data.series || 0,
      lastUpdate: data.updatedAt ? new Date(data.updatedAt).toLocaleDateString() : 'Unknown'
    };
    
  } catch (error) {
    console.error('❌ Error getting IPTV stats:', error.message);
    return getDefaultIPTVStats();
  }
}

// Helper function to get Plex statistics with database caching
async function getPlexStats() {
  try {
    console.log('📊 Getting Plex content statistics...');
    
    // FIX: Remove the array destructuring - get the full result
    const cachedStats = await db.query(`
      SELECT stat_key, stat_value, last_updated 
      FROM plex_statistics 
      WHERE stat_key IN ('hd_movies', 'anime_movies', 'fourk_movies', 'tv_shows', 'anime_tv_shows', 'tv_seasons', 'tv_episodes', 'audiobooks')
      ORDER BY last_updated DESC
    `);

    // DEBUG: Log what we actually got from database
    console.log('🔍 DEBUG: Raw database result:', cachedStats);
    console.log('🔍 DEBUG: cachedStats type:', typeof cachedStats);
    console.log('🔍 DEBUG: cachedStats length:', cachedStats ? cachedStats.length : 'undefined');

    // FIX: Check if cachedStats exists and has data
    if (!cachedStats || !Array.isArray(cachedStats) || cachedStats.length === 0) {
      console.log('📊 No cached Plex stats found');
      return getDefaultPlexStats();
    }
    
    // FIX: Check if first element exists before accessing last_updated
    if (cachedStats[0] && cachedStats[0].last_updated) {
      const lastUpdate = new Date(cachedStats[0].last_updated);
      const fourHoursAgo = new Date(Date.now() - (4 * 60 * 60 * 1000));
      
      if (lastUpdate < fourHoursAgo) {
        console.log('📊 Plex cache is stale');
      }
    }
    
    // Build stats from cached data
    const stats = {
      hdMovies: 0,
      animeMovies: 0,
      fourkMovies: 0,
      tvShows: 0,
      animeTVShows: 0,
      tvSeasons: 0,
      tvEpisodes: 0,
      audioBooks: 0,
      lastUpdate: new Date().toLocaleDateString()
    };
    
    // Process cached entries
    for (const row of cachedStats) {
      if (!row || !row.stat_key || row.stat_value === undefined) {
        continue; // Skip invalid rows
      }
      
      switch (row.stat_key) {
        case 'hd_movies':
          stats.hdMovies = parseInt(row.stat_value) || 0;
          break;
        case 'anime_movies':
          stats.animeMovies = parseInt(row.stat_value) || 0;
          break;
        case 'fourk_movies':
          stats.fourkMovies = parseInt(row.stat_value) || 0;
          break;
        case 'tv_shows':
          stats.tvShows = parseInt(row.stat_value) || 0;
          break;
        case 'anime_tv_shows':
          stats.animeTVShows = parseInt(row.stat_value) || 0;
          break;
        case 'tv_seasons':
          stats.tvSeasons = parseInt(row.stat_value) || 0;
          break;
        case 'tv_episodes':
          stats.tvEpisodes = parseInt(row.stat_value) || 0;
          break;
        case 'audiobooks':
          stats.audioBooks = parseInt(row.stat_value) || 0;
          break;
      }
    }
    
    console.log(`✅ Plex stats from cache: HD:${stats.hdMovies}, Anime:${stats.animeMovies}, 4K:${stats.fourkMovies}, TV:${stats.tvShows}, AnimeTV:${stats.animeTVShows}, Seasons:${stats.tvSeasons}, Episodes:${stats.tvEpisodes}, Audio:${stats.audioBooks}`);
    
    return stats;
    
  } catch (error) {
    console.error('❌ Error getting Plex stats:', error);
    return getDefaultPlexStats();
  }
}

// Helper function to get cached Plex stats from database
async function getCachedPlexStats() {
  try {
    const [cachedStats] = await db.query(`
      SELECT library_name, library_type, content_count, additional_data
      FROM library_statistics 
      WHERE stat_type = 'plex'
      ORDER BY last_updated DESC
      LIMIT 20
    `);
    
    if (cachedStats.length === 0) {
      return getDefaultPlexStats();
    }
    
    // Build stats object from cached data
    const stats = {
      hdMovies: 0,
      animeMovies: 0,
      fourkMovies: 0,
      tvShows: 0,
      tvSeasons: 0,
      tvEpisodes: 0,
      audioBooks: 0,
      lastUpdate: 'From cache'
    };
    
    // Process cached entries
    for (const stat of cachedStats) {
      switch (stat.library_name) {
        case 'HD Movies':
          stats.hdMovies = stat.content_count;
          break;
        case 'Anime Movies':
          stats.animeMovies = stat.content_count;
          break;
        case '4K Movies':
          stats.fourkMovies = stat.content_count;
          break;
        case 'TV Shows':
          stats.tvShows = stat.content_count;
          break;
        case 'Episodes':
          stats.tvEpisodes = stat.content_count;
          break;
        case 'Audio Books':
          stats.audioBooks = stat.content_count;
          break;
      }
    }
    
    return stats;
    
  } catch (error) {
    console.error('❌ Error getting cached Plex stats:', error);
    return getDefaultPlexStats();
  }
}

// Helper function to cache statistics in database
async function cacheStats(statType, processedStats, rawData) {
  try {
    // Clear old cache for this stat type
    await db.query('DELETE FROM library_statistics WHERE stat_type = ?', [statType]);
    
    if (statType === 'plex') {
      // Insert individual library stats
      const insertPromises = [
        db.query(
          'INSERT INTO library_statistics (stat_type, server_name, library_name, library_type, content_count) VALUES (?, ?, ?, ?, ?)',
          ['plex', 'Plex 1', 'HD Movies', 'movie', processedStats.hdMovies]
        ),
        db.query(
          'INSERT INTO library_statistics (stat_type, server_name, library_name, library_type, content_count) VALUES (?, ?, ?, ?, ?)',
          ['plex', 'Plex 1', 'Anime Movies', 'movie', processedStats.animeMovies]
        ),
        db.query(
          'INSERT INTO library_statistics (stat_type, server_name, library_name, library_type, content_count) VALUES (?, ?, ?, ?, ?)',
          ['plex', 'Plex 1 4K', '4K Movies', 'movie', processedStats.fourkMovies]
        ),
        db.query(
          'INSERT INTO library_statistics (stat_type, server_name, library_name, library_type, content_count) VALUES (?, ?, ?, ?, ?)',
          ['plex', 'Plex 1', 'TV Shows', 'show', processedStats.tvShows]
        ),
        db.query(
          'INSERT INTO library_statistics (stat_type, server_name, library_name, library_type, content_count) VALUES (?, ?, ?, ?, ?)',
          ['plex', 'Plex 1', 'Episodes', 'show', processedStats.tvEpisodes]
        ),
        db.query(
          'INSERT INTO library_statistics (stat_type, server_name, library_name, library_type, content_count) VALUES (?, ?, ?, ?, ?)',
          ['plex', 'Plex 1', 'Audio Books', 'artist', processedStats.audioBooks]
        )
      ];
      
      await Promise.all(insertPromises);
    }
    
    // Update last update timestamp
    await db.query(
      `INSERT INTO settings (setting_key, setting_value, setting_type) 
       VALUES (?, ?, 'string') 
       ON DUPLICATE KEY UPDATE setting_value = ?`,
      [`${statType}_stats_last_update`, new Date().toISOString(), new Date().toISOString()]
    );
    
    console.log(`✅ Cached ${statType} statistics in database`);
    
  } catch (error) {
    console.error(`❌ Error caching ${statType} stats:`, error);
  }
}

// Helper function to check if cache is still valid
function checkCacheValidity(lastUpdateStr, intervalSeconds) {
  if (!lastUpdateStr) return false;
  
  try {
    const lastUpdate = new Date(lastUpdateStr);
    const now = new Date();
    const intervalMs = parseInt(intervalSeconds) * 1000;
    
    return (now.getTime() - lastUpdate.getTime()) < intervalMs;
  } catch (error) {
    return false;
  }
}

// Default fallback functions
function getDefaultUserStats() {
  return { 
    total: 0, 
    plex1: 0, 
    plex2: 0, 
    iptv: 0, 
    totalSubscriptions: 0 
  };
}

function getDefaultIPTVStats() {
  return { 
    channels: 0, 
    movies: 0, 
    series: 0, 
    lastUpdate: 'Not configured' 
  };
}

function getDefaultPlexStats() {
  return {
    hdMovies: 0,
    animeMovies: 0,
    fourkMovies: 0,
    tvShows: 0,
    tvSeasons: 0,
    tvEpisodes: 0,
    audioBooks: 0,
    lastUpdate: 'Not available'
  };
}

// NEW: Get live IPTV viewers using both endpoints for complete data
async function getIPTVLiveViewers() {
  try {
    console.log('🔴 Getting live IPTV viewers using cached token...');
    
    const iptvService = require('./iptv-service');
    
    // Get cached authentication
    const cachedAuth = iptvService.getCachedAuth();
    
    if (!cachedAuth.isValid) {
      console.log('⚠️ No valid cached token available');
      return { viewers: [], total: 0, error: 'Authentication not available' };
    }
    
    console.log('✅ Using cached IPTV authentication');
    
    // Make both API calls in parallel
    const [connectionsResponse, usersResponse] = await Promise.allSettled([
      // Get active streaming connections
      axios.post('https://panel.pinkpony.lol/rconnections/data', {
        draw: 1,
        start: 0,
        length: 1000,
        search: ''
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': cachedAuth.csrfToken,
          'Cookie': cachedAuth.sessionCookies,
          'User-Agent': 'Mozilla/5.0 (compatible; JohnsonFlix/1.0)',
          'Accept': 'application/json',
          'Referer': 'https://panel.pinkpony.lol/dashboard',
          'Origin': 'https://panel.pinkpony.lol'
        },
        timeout: 15000
      }),
      
      // Get user account data for connection limits
      axios.post('https://panel.pinkpony.lol/lines/data', {
        draw: 1,
        start: 0,
        length: 1000,
        search: '',
        reseller: '1435'
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': cachedAuth.csrfToken,
          'Cookie': cachedAuth.sessionCookies,
          'User-Agent': 'Mozilla/5.0 (compatible; JohnsonFlix/1.0)',
          'Accept': 'application/json',
          'Referer': 'https://panel.pinkpony.lol/dashboard',
          'Origin': 'https://panel.pinkpony.lol'
        },
        timeout: 15000
      })
    ]);
    
    // Process connections data
    let connectionsData = [];
    if (connectionsResponse.status === 'fulfilled' && connectionsResponse.value?.data?.data) {
      connectionsData = connectionsResponse.value.data.data;
      console.log(`📡 Got ${connectionsData.length} active streaming connections`);
    } else {
      console.warn('⚠️ Failed to get connections data:', connectionsResponse.reason?.message);
    }
    
    // Process users data
    let usersData = [];
    if (usersResponse.status === 'fulfilled' && usersResponse.value?.data?.data) {
      usersData = usersResponse.value.data.data;
      console.log(`👥 Got ${usersData.length} user accounts`);
    } else {
      console.warn('⚠️ Failed to get users data:', usersResponse.reason?.message);
    }
    
    // Create user lookup map for connection limits
    const userLookup = {};
    usersData.forEach(user => {
      userLookup[user.username] = {
        maxConnections: parseInt(user.user_connection) || 0,
        activeConnections: parseInt(user.active_connections) || 0,
        expireDate: user.exp_date || 'Unknown',
        enabled: user.enabled
      };
    });
    
    // Process and group connections by user
    const userConnections = {};
    connectionsData.forEach(conn => {
      const username = conn.username;
      
      if (!userConnections[username]) {
        userConnections[username] = {
          username: username,
          connections: [],
          totalConnections: 0,
          maxConnections: userLookup[username]?.maxConnections || 0,
          activeConnections: userLookup[username]?.activeConnections || 0,
          expireDate: userLookup[username]?.expireDate || 'Unknown',
          isOwner: conn.owner === 'johnsonflix',
          userIP: conn.user_ip,
          geoCountry: conn.geoip_country_code,
          isp: conn.isp
        };
      }
      
      // Add this connection/stream to the user
      userConnections[username].connections.push({
        streamName: conn.stream_display_name || 'Unknown Stream',
        userAgent: conn.user_agent || 'Unknown',
        startTime: conn.date_start || 'Unknown',
        totalOnlineTime: conn.total_time_online || '0s',
        container: conn.container || 'unknown',
        serverId: conn.server_id
      });
      
      userConnections[username].totalConnections = userConnections[username].connections.length;
    });
    
    // Convert to array format for response
    const activeViewers = Object.values(userConnections);
    
    console.log(`🔴 Found ${activeViewers.length} users with active streams`);
    
    // Log sample data for debugging
    if (activeViewers.length > 0) {
      console.log('📺 Sample viewer:', {
        username: activeViewers[0].username,
        connections: `${activeViewers[0].totalConnections}/${activeViewers[0].maxConnections}`,
        streams: activeViewers[0].connections.length,
        firstStream: activeViewers[0].connections[0]?.streamName
      });
    }
    
    return {
      viewers: activeViewers,
      total: activeViewers.length,
      totalConnections: connectionsData.length,
      lastUpdate: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('❌ Error getting IPTV live viewers:', error.message);
    
    // If it's a CSRF error, the cached token may have expired
    if (error.response?.status === 419) {
      console.log('🔐 CSRF token expired, triggering refresh...');
      const iptvService = require('./iptv-service');
      iptvService.forceRefreshToken().catch(console.error);
    }
    
    return { 
      viewers: [], 
      total: 0, 
      error: `Failed to load IPTV viewers: ${error.message}` 
    };
  }
}

// REPLACE the existing getPlexNowPlaying() function with this complete implementation:

async function getPlexNowPlaying() {
  try {
    console.log('🎬 Getting Plex now playing sessions from all servers...');
    
    // Get Plex server configs
    const plexConfigs = getPlexServerConfigs();
    const allSessions = [];
    
    // Fetch sessions from all servers
    const serverPromises = [];
    
    for (const [serverGroup, config] of Object.entries(plexConfigs)) {
      // Add regular server
      serverPromises.push(fetchServerSessions(config.regular, `${serverGroup}-regular`));
      
      // Add 4K server if different from regular
      if (config.fourk && config.fourk.serverId !== config.regular.serverId) {
        serverPromises.push(fetchServerSessions(config.fourk, `${serverGroup}-4k`));
      }
    }
    
    // Wait for all server requests
    const results = await Promise.allSettled(serverPromises);
    
    // Combine all successful results
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        allSessions.push(...result.value);
      } else {
        console.warn(`Server ${index} sessions failed:`, result.reason?.message);
      }
    });
    
    // Sort by most recent activity
    allSessions.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    
    console.log(`🎬 Found ${allSessions.length} total Plex sessions across all servers`);
    
    return {
      sessions: allSessions,
      total: allSessions.length,
      lastUpdate: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('❌ Error getting Plex now playing:', error.message);
    return { 
      sessions: [], 
      total: 0, 
      error: `Failed to load Plex sessions: ${error.message}` 
    };
  }
}

// ADD these new helper functions AFTER the getPlexNowPlaying() function:

// Fetch sessions from a single Plex server
async function fetchServerSessions(serverConfig, serverName) {
  try {
    console.log(`🔍 Fetching sessions from ${serverName}...`);
    
    // Try Plex.tv API first (more reliable for sessions)
    const plexTvUrl = `https://plex.tv/api/servers/${serverConfig.serverId}/status/sessions`;
    
    try {
      const response = await axios.get(plexTvUrl, {
        headers: {
          'X-Plex-Token': serverConfig.token,
          'Accept': 'application/xml'
        },
        timeout: 10000
      });
      
      const sessions = await parseSessionsXML(response.data, serverConfig, serverName);
      console.log(`✅ ${serverName}: Found ${sessions.length} sessions via Plex.tv`);
      return sessions;
      
    } catch (plexTvError) {
      console.log(`⚠️ Plex.tv API failed for ${serverName}, trying direct connection...`);
      
      // Fallback to direct server connection
      const directUrl = `${serverConfig.url}/status/sessions`;
      const directResponse = await axios.get(directUrl, {
        headers: {
          'X-Plex-Token': serverConfig.token,
          'Accept': 'application/xml'
        },
        timeout: 15000
      });
      
      const sessions = await parseSessionsXML(directResponse.data, serverConfig, serverName);
      console.log(`✅ ${serverName}: Found ${sessions.length} sessions via direct connection`);
      return sessions;
    }
    
  } catch (error) {
    console.error(`❌ Failed to fetch sessions from ${serverName}:`, error.message);
    return [];
  }
}

// Parse Plex XML sessions response into our format
async function parseSessionsXML(xmlData, serverConfig, serverName) {
  try {
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xmlData);
    
    if (!result || !result.MediaContainer || !result.MediaContainer.Video) {
      return [];
    }
    
    let videos = result.MediaContainer.Video;
    if (!Array.isArray(videos)) {
      videos = [videos];
    }
    
    const sessions = videos.map(video => {
      const session = parseVideoSession(video, serverConfig, serverName);
      return session;
    }).filter(session => session !== null);
    
    return sessions;
    
  } catch (error) {
    console.error('Error parsing sessions XML:', error);
    return [];
  }
}

// REPLACE the parseVideoSession function in routes-dashboard.js with this enhanced version:

function parseVideoSession(video, serverConfig, serverName) {
  try {
    const attrs = video.$ || {};
    const user = video.User && video.User[0] && video.User[0].$ ? video.User[0].$.title : 'Unknown User';
    const player = video.Player && video.Player[0] && video.Player[0].$ ? video.Player[0] : {};
    
    // Enhanced media parsing
    const media = video.Media && video.Media[0] && video.Media[0].$ ? video.Media[0] : {};
    const part = media.Part && media.Part && media.Part[0] ? media.Part[0] : {};
    const stream = part.Stream && part.Stream[0] && part.Stream[0].$ ? part.Stream[0] : {};
    
    console.log(`🎬 Parsing session for: ${attrs.title} - User: ${user}`);
    console.log(`📊 Raw video attrs:`, Object.keys(attrs));
    console.log(`📊 Raw media:`, Object.keys(media));
    console.log(`📊 Raw player:`, Object.keys(player));
    
    // Enhanced progress calculation
    const viewOffset = parseInt(attrs.viewOffset) || 0;
    const duration = parseInt(attrs.duration) || 1;
    const progress = duration > 0 ? Math.round((viewOffset / duration) * 100) : 0;
    
    // Enhanced quality information
    let quality = 'Unknown';
    let resolution = 'Unknown';
    let bitrate = null;
    
    if (media.videoResolution) {
      resolution = media.videoResolution.toUpperCase();
      quality = resolution;
      
      if (media.bitrate) {
        bitrate = parseInt(media.bitrate);
        quality += ` (${Math.round(bitrate / 1000)}Mbps)`;
      }
    } else if (stream.displayTitle) {
      quality = stream.displayTitle;
      resolution = stream.displayTitle;
    }
    
    // Enhanced thumbnail handling
    let thumbUrl = '';
    if (attrs.thumb) {
      if (attrs.thumb.startsWith('/')) {
        // Local thumbnail - construct full URL
        thumbUrl = `${serverConfig.url}${attrs.thumb}?X-Plex-Token=${serverConfig.token}`;
      } else if (attrs.thumb.startsWith('http')) {
        // External thumbnail - use as is but add token if needed
        thumbUrl = attrs.thumb;
        if (!thumbUrl.includes('X-Plex-Token')) {
          thumbUrl += (thumbUrl.includes('?') ? '&' : '?') + `X-Plex-Token=${serverConfig.token}`;
        }
      } else {
        // Relative path
        thumbUrl = `${serverConfig.url}${attrs.thumb.startsWith('/') ? '' : '/'}${attrs.thumb}?X-Plex-Token=${serverConfig.token}`;
      }
    }
    
    // Also try art for fallback
    if (!thumbUrl && attrs.art) {
      if (attrs.art.startsWith('/')) {
        thumbUrl = `${serverConfig.url}${attrs.art}?X-Plex-Token=${serverConfig.token}`;
      }
    }
    
    // Enhanced content type and subtitle handling
    let subtitle = '';
    let contentType = attrs.type || 'unknown';
    
    if (contentType === 'episode') {
      // TV Show Episode
      const showTitle = attrs.grandparentTitle || 'Unknown Show';
      const seasonNum = attrs.parentIndex ? String(attrs.parentIndex).padStart(2, '0') : '00';
      const episodeNum = attrs.index ? String(attrs.index).padStart(2, '0') : '00';
      const episodeTitle = attrs.title || 'Unknown Episode';
      
      subtitle = `${showTitle} - S${seasonNum}E${episodeNum}`;
      
      // If there's a year, add it
      if (attrs.year) {
        subtitle += ` (${attrs.year})`;
      }
    } else if (contentType === 'movie') {
      // Movie
      if (attrs.year) {
        subtitle = `(${attrs.year})`;
      }
      if (attrs.studio) {
        subtitle += subtitle ? ` • ${attrs.studio}` : attrs.studio;
      }
    } else if (contentType === 'track') {
      // Music Track
      const artist = attrs.grandparentTitle || attrs.parentTitle || 'Unknown Artist';
      const album = attrs.parentTitle || 'Unknown Album';
      subtitle = `${artist} - ${album}`;
    }
    
    // Enhanced technical information
    const videoCodec = stream.codec || media.videoCodec || 'Unknown';
    const audioCodec = media.audioCodec || 'Unknown';  
    const container = media.container || part.container || 'Unknown';
    
    // Enhanced bandwidth calculation
    let bandwidth = 'Unknown';
    if (media.bitrate) {
      bandwidth = `${Math.round(media.bitrate / 1000)} Mbps`;
    } else if (part.bitrate) {
      bandwidth = `${Math.round(part.bitrate / 1000)} Mbps`;
    }
    
    // Enhanced player information
    const playerTitle = player.title || player.device || 'Unknown Player';
    const playerAddress = player.address || player.remotePublicAddress || 'Unknown Location';
    const playerProduct = player.product || 'Unknown Client';
    
    // Enhanced state detection
    let state = player.state || 'unknown';
    if (!['playing', 'paused', 'buffering', 'stopped'].includes(state)) {
      state = 'unknown';
    }
    
    // Format durations
    const formatDuration = (ms) => {
      if (!ms || ms <= 0) return '0:00';
      const totalSeconds = Math.floor(ms / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      
      if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      } else {
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
      }
    };
    
    const durationFormatted = formatDuration(duration);
    const remainingTime = formatDuration(duration - viewOffset);
    const elapsedTime = formatDuration(viewOffset);
    
    // Enhanced session object with all the data Tautulli shows
    const sessionData = {
      // Basic identification
      sessionKey: attrs.sessionKey || attrs.key,
      ratingKey: attrs.ratingKey,
      
      // User information
      user: user,
      userId: video.User && video.User[0] && video.User[0].$.id ? video.User[0].$.id : null,
      
      // Content information
      title: attrs.title || 'Unknown Title',
      subtitle: subtitle,
      type: contentType,
      year: attrs.year || null,
      
      // For TV shows
      grandparentTitle: attrs.grandparentTitle || null, // Show name
      parentTitle: attrs.parentTitle || null, // Season name
      parentIndex: attrs.parentIndex || null, // Season number
      index: attrs.index || null, // Episode number
      
      // Media information
      thumb: thumbUrl,
      art: attrs.art,
      duration: duration,
      durationFormatted: durationFormatted,
      
      // Progress information
      viewOffset: viewOffset,
      progress: progress,
      elapsedTime: elapsedTime,
      remainingTime: remainingTime,
      
      // Quality and technical information
      quality: quality,
      resolution: resolution,
      bitrate: bitrate,
      bandwidth: bandwidth,
      videoCodec: videoCodec.toUpperCase(),
      audioCodec: audioCodec.toUpperCase(),
      container: container.toUpperCase(),
      
      // Player information
      state: state,
      playerTitle: playerTitle,
      playerProduct: playerProduct,
      location: playerAddress,
      
      // Server information
      serverUrl: serverConfig.url,
      serverName: serverName,
      token: serverConfig.token,
      
      // Additional metadata
      rating: attrs.rating || null,
      studio: attrs.studio || null,
      guid: attrs.guid || null,
      
      // Timestamps
      addedAt: attrs.addedAt ? new Date(parseInt(attrs.addedAt) * 1000).toISOString() : null,
      updatedAt: new Date().toISOString(),
      
      // Raw data for debugging
      _debug: {
        rawAttrs: attrs,
        rawMedia: media,
        rawPlayer: player,
        hasThumb: !!attrs.thumb,
        hasArt: !!attrs.art,
        thumbUrl: thumbUrl
      }
    };
    
    console.log(`✅ Parsed session for ${sessionData.title}:`, {
      user: sessionData.user,
      state: sessionData.state,
      progress: `${sessionData.progress}%`,
      quality: sessionData.quality,
      hasThumb: !!sessionData.thumb
    });
    
    return sessionData;
    
  } catch (error) {
    console.error('❌ Error parsing video session:', error);
    console.error('❌ Raw video data:', video);
    return null;
  }
}

// Helper function to format duration in milliseconds to readable time
function formatDuration(ms) {
  if (!ms || ms <= 0) return '0:00';
  
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:00`;
  } else {
    return `${minutes}:00`;
  }
}

// Get Plex server configurations from existing Plex service
function getPlexServerConfigs() {
  try {
    // Use the existing Plex service's configuration
    const plexService = require('./plex-service');
    const configs = plexService.getServerConfig();
    
    console.log('✅ Loaded Plex config from plex-service.js');
    return configs;
    
  } catch (error) {
    console.error('❌ Error loading Plex service:', error);
    
    // Fallback to hardcoded config if service not available
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
          url: 'http://192.168.10.92:32400'
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
          url: 'http://192.168.10.92:32700'
        }
      }
    };
  }
}

// ADD this debug route to your routes-dashboard.js file (after the existing routes)

// DEBUG: Get raw Plex session data for troubleshooting
router.get('/plex-debug', async (req, res) => {
  try {
    console.log('🔍 DEBUG: Getting raw Plex session data...');
    
    const plexConfigs = getPlexServerConfigs();
    const debugInfo = {
      servers: {},
      rawSessions: [],
      parsedSessions: [],
      errors: []
    };
    
    // Test each server individually
    for (const [serverGroup, config] of Object.entries(plexConfigs)) {
      debugInfo.servers[serverGroup] = {
        regular: { tested: false, error: null, rawXML: null, sessionCount: 0 },
        fourk: { tested: false, error: null, rawXML: null, sessionCount: 0 }
      };
      
      // Test regular server
      try {
        console.log(`🔍 Testing ${serverGroup}-regular...`);
        const regularSessions = await fetchServerSessions(config.regular, `${serverGroup}-regular`);
        debugInfo.servers[serverGroup].regular = {
          tested: true,
          error: null,
          sessionCount: regularSessions.length,
          sessions: regularSessions
        };
        debugInfo.parsedSessions.push(...regularSessions);
      } catch (error) {
        debugInfo.servers[serverGroup].regular = {
          tested: true,
          error: error.message,
          sessionCount: 0
        };
        debugInfo.errors.push(`${serverGroup}-regular: ${error.message}`);
      }
      
      // Test 4K server if different
      if (config.fourk && config.fourk.serverId !== config.regular.serverId) {
        try {
          console.log(`🔍 Testing ${serverGroup}-4k...`);
          const fourkSessions = await fetchServerSessions(config.fourk, `${serverGroup}-4k`);
          debugInfo.servers[serverGroup].fourk = {
            tested: true,
            error: null,
            sessionCount: fourkSessions.length,
            sessions: fourkSessions
          };
          debugInfo.parsedSessions.push(...fourkSessions);
        } catch (error) {
          debugInfo.servers[serverGroup].fourk = {
            tested: true,
            error: error.message,
            sessionCount: 0
          };
          debugInfo.errors.push(`${serverGroup}-4k: ${error.message}`);
        }
      }
    }
    
    // Get raw XML from one server for debugging
    try {
      const firstConfig = Object.values(plexConfigs)[0]?.regular;
      if (firstConfig) {
        console.log('🔍 Getting raw XML for debugging...');
        const directUrl = `${firstConfig.url}/status/sessions`;
        const response = await axios.get(directUrl, {
          headers: {
            'X-Plex-Token': firstConfig.token,
            'Accept': 'application/xml'
          },
          timeout: 15000
        });
        debugInfo.rawXML = response.data;
      }
    } catch (error) {
      debugInfo.rawXMLError = error.message;
    }
    
    const summary = {
      totalSessions: debugInfo.parsedSessions.length,
      serversChecked: Object.keys(debugInfo.servers).length * 2,
      errors: debugInfo.errors.length,
      hasData: debugInfo.parsedSessions.length > 0
    };
    
    console.log('🔍 Debug summary:', summary);
    
    res.json({
      success: true,
      summary: summary,
      debugInfo: debugInfo,
      sampleSession: debugInfo.parsedSessions[0] || null,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Debug route error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// DEBUG: Test individual server connection and XML parsing
router.get('/plex-debug/:serverGroup/:serverType', async (req, res) => {
  try {
    const { serverGroup, serverType } = req.params;
    
    if (!['plex1', 'plex2'].includes(serverGroup) || !['regular', 'fourk'].includes(serverType)) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }
    
    const plexConfigs = getPlexServerConfigs();
    const serverConfig = plexConfigs[serverGroup]?.[serverType];
    
    if (!serverConfig) {
      return res.status(404).json({ error: 'Server configuration not found' });
    }
    
    console.log(`🔍 DEBUG: Testing ${serverGroup}-${serverType}...`);
    
    const debugResult = {
      serverConfig: {
        name: serverConfig.name,
        url: serverConfig.url,
        serverId: serverConfig.serverId,
        hasToken: !!serverConfig.token
      },
      tests: {
        plexTvAPI: { success: false, error: null, data: null },
        directConnection: { success: false, error: null, data: null },
        xmlParsing: { success: false, error: null, sessions: [] }
      }
    };
    
    // Test 1: Plex.tv API
    try {
      const plexTvUrl = `https://plex.tv/api/servers/${serverConfig.serverId}/status/sessions`;
      const plexTvResponse = await axios.get(plexTvUrl, {
        headers: {
          'X-Plex-Token': serverConfig.token,
          'Accept': 'application/xml'
        },
        timeout: 10000
      });
      
      debugResult.tests.plexTvAPI.success = true;
      debugResult.tests.plexTvAPI.data = plexTvResponse.data.substring(0, 500) + '...'; // Truncated
      
      // Try parsing
      try {
        const sessions = await parseSessionsXML(plexTvResponse.data, serverConfig, `${serverGroup}-${serverType}`);
        debugResult.tests.xmlParsing.success = true;
        debugResult.tests.xmlParsing.sessions = sessions;
      } catch (parseError) {
        debugResult.tests.xmlParsing.error = parseError.message;
      }
      
    } catch (error) {
      debugResult.tests.plexTvAPI.error = error.message;
      
      // Test 2: Direct connection fallback
      try {
        const directUrl = `${serverConfig.url}/status/sessions`;
        const directResponse = await axios.get(directUrl, {
          headers: {
            'X-Plex-Token': serverConfig.token,
            'Accept': 'application/xml'
          },
          timeout: 15000
        });
        
        debugResult.tests.directConnection.success = true;
        debugResult.tests.directConnection.data = directResponse.data.substring(0, 500) + '...'; // Truncated
        
        // Try parsing
        try {
          const sessions = await parseSessionsXML(directResponse.data, serverConfig, `${serverGroup}-${serverType}`);
          debugResult.tests.xmlParsing.success = true;
          debugResult.tests.xmlParsing.sessions = sessions;
        } catch (parseError) {
          debugResult.tests.xmlParsing.error = parseError.message;
        }
        
      } catch (directError) {
        debugResult.tests.directConnection.error = directError.message;
      }
    }
    
    res.json({
      success: true,
      server: `${serverGroup}-${serverType}`,
      debugResult: debugResult,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Individual server debug error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;