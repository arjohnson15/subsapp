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

// Helper function to get user statistics from database
async function getUserStats() {
  try {
    console.log('📊 Collecting user statistics...');
    
    // Get all users with their tags
    const [users] = await db.query(`
      SELECT 
        tags,
        JSON_CONTAINS(tags, '"Plex 1"') as has_plex1,
        JSON_CONTAINS(tags, '"Plex 2"') as has_plex2, 
        JSON_CONTAINS(tags, '"IPTV"') as has_iptv,
        subscription_expiry
      FROM users 
      WHERE tags IS NOT NULL AND tags != '[]'
    `);
    
    const totalUsers = users.length;
    const plex1Users = users.filter(u => u.has_plex1).length;
    const plex2Users = users.filter(u => u.has_plex2).length;
    const iptvUsers = users.filter(u => u.has_iptv).length;
    
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

// Helper function to get Plex statistics using Python script
async function getPlexStats() {
  try {
    console.log('📊 Collecting Plex content statistics...');
    
    return new Promise((resolve) => {
      // Execute Python script to get Plex stats
      const python = spawn('python3', ['plex_statistics.py'], {
        cwd: __dirname,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let dataString = '';
      let errorString = '';
      
      python.stdout.on('data', (data) => {
        dataString += data.toString();
      });
      
      python.stderr.on('data', (data) => {
        errorString += data.toString();
      });
      
      python.on('close', (code) => {
        if (code !== 0) {
          console.error('❌ Python script error:', errorString);
          resolve(getDefaultPlexStats());
          return;
        }
        
        if (!dataString.trim()) {
          console.error('❌ Python script returned empty data');
          resolve(getDefaultPlexStats());
          return;
        }
        
        try {
          const rawStats = JSON.parse(dataString);
          console.log('📊 Raw Plex stats received:', JSON.stringify(rawStats, null, 2));
          
          // Process and combine stats for dashboard display
          const processedStats = {
            plex1: {
              movies: rawStats.plex1?.regular?.stats?.movies || 0,
              shows: rawStats.plex1?.regular?.stats?.shows || 0, 
              episodes: rawStats.plex1?.regular?.stats?.episodes || 0,
              fourkMovies: rawStats.plex1?.fourk?.stats?.movies || 0
            },
            plex2: {
              movies: rawStats.plex2?.regular?.stats?.movies || 0,
              shows: rawStats.plex2?.regular?.stats?.shows || 0,
              episodes: rawStats.plex2?.regular?.stats?.episodes || 0, 
              fourkMovies: rawStats.plex2?.fourk?.stats?.movies || 0
            },
            // Combine audio books from both servers (stored as 'artists' in Plex)
            audioBooks: (rawStats.plex1?.regular?.stats?.artists || 0) + 
                       (rawStats.plex2?.regular?.stats?.artists || 0),
            lastUpdate: new Date().toLocaleDateString()
          };
          
          console.log(`✅ Processed Plex stats: P1(${processedStats.plex1.movies}/${processedStats.plex1.fourkMovies}), P2(${processedStats.plex2.movies}/${processedStats.plex2.fourkMovies}), AudioBooks: ${processedStats.audioBooks}`);
          resolve(processedStats);
          
        } catch (parseError) {
          console.error('❌ Error parsing Plex stats:', parseError);
          resolve(getDefaultPlexStats());
        }
      });
      
      python.on('error', (err) => {
        console.error('❌ Failed to spawn Python process:', err);
        resolve(getDefaultPlexStats());
      });
    });
    
  } catch (error) {
    console.error('❌ Error getting Plex stats:', error);
    return getDefaultPlexStats();
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
    plex1: { movies: 0, shows: 0, episodes: 0, fourkMovies: 0 },
    plex2: { movies: 0, shows: 0, episodes: 0, fourkMovies: 0 },
    audioBooks: 0,
    lastUpdate: 'Not available'
  };
}

module.exports = router;