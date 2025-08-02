const express = require('express');
const router = express.Router();
const db = require('./database-config');
const axios = require('axios');
const { spawn } = require('child_process');

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

module.exports = router;