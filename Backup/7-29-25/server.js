// server.js - COMPLETE REPLACEMENT FILE
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cron = require('node-cron');
require('dotenv').config();

const db = require('./database-config');
const authRoutes = require('./routes-auth');
const userRoutes = require('./users-routes');
const subscriptionRoutes = require('./routes-subscriptions');
const emailRoutes = require('./routes-email');
const plexRoutes = require('./routes-plex');
const settingsRoutes = require('./routes-settings');
const ownerRoutes = require('./routes-owners');
const emailScheduleRoutes = require('./routes-email-schedules');
const multer = require('multer');
const plexService = require('./plex-service');
const emailService = require('./email-service');
const iptvRoutes = require('./routes-iptv');
const iptvEditorRoutes = require('./routes-iptv-editor'); // NEW
const iptvEditorService = require('./iptv-editor-service'); // NEW

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy - fix for rate limiter warning
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false  // ✅ Completely disables CSP
}));

// Rate limiting
// High rate limit for subscription management app with few hundred users
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 1000, // 1000 requests per minute per IP
  message: {
    error: 'Rate limit exceeded - please wait a moment',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// CORS
app.use(cors());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/plex', plexRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/owners', ownerRoutes);
app.use('/api/email-schedules', emailScheduleRoutes);
app.use('/api/iptv', iptvRoutes);
app.use('/api/iptv-editor', iptvEditorRoutes); 

// ===== GUIDE ROUTES - RESTORED =====
// Serve guide static files first (CSS, JS, images, etc.)
app.use('/guide', express.static(path.join(__dirname, 'Guides')));

// Dynamic guide route - serve any HTML file from Guides folder
app.get('/guide/:filename', (req, res) => {
  const filename = req.params.filename;
  
  // Add .html extension if not provided
  const htmlFile = filename.endsWith('.html') ? filename : `${filename}.html`;
  
  const filePath = path.join(__dirname, 'Guides', htmlFile);
  
  // Check if file exists and serve it
  res.sendFile(filePath, (err) => {
    if (err) {
      console.log(`Guide file not found: ${htmlFile}`);
      res.status(404).send('Guide not found');
    }
  });
});

// Fallback route for /guide (serve index if it exists, otherwise guide.html)
app.get('/guide', (req, res) => {
  const indexPath = path.join(__dirname, 'Guides', 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      // If no index.html, serve guide.html
      const guidePath = path.join(__dirname, 'Guides', 'guide.html');
      res.sendFile(guidePath, (err) => {
        if (err) {
          res.status(404).send('No guide available');
        }
      });
    }
  });
});
// ===== END GUIDE ROUTES =====

// Initialize IPTV Editor service
async function initializeIPTVEditorService() {
    try {
        await iptvEditorService.initialize();
        console.log('✅ IPTV Editor service initialized');
    } catch (error) {
        console.warn('⚠️ IPTV Editor service initialization failed:', error.message);
    }
}

// Serve main application
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const iptvService = require('./iptv-service');

// IPTV Hourly Sync
cron.schedule('0 * * * *', async () => {
  try {
    console.log('🔄 Starting IPTV hourly sync...');
    
    // Initialize service
    await iptvService.initialize();
    
    // Sync credits (fast operation)
    console.log('💰 Syncing credit balance...');
    await iptvService.syncCreditBalance();
    
    // Sync packages (moderate operation)
    console.log('📦 Syncing packages...');
    const packageCount = await iptvService.syncPackagesFromPanel();
    console.log(`✅ Synced ${packageCount} packages`);
    
    // Sync bouquets (longer operation)
    console.log('📺 Syncing bouquets...');
    const bouquetCount = await iptvService.syncBouquetsFromPanel();
    console.log(`✅ Synced ${bouquetCount} bouquets`);
    
    // Ensure authentication is still valid
    await iptvService.ensureAuthenticated();
    
    console.log('✅ IPTV hourly sync completed successfully');
    
  } catch (error) {
    console.error('❌ IPTV hourly sync failed:', error);
    
    // Log specific error details for debugging
    if (error.message) {
      console.error('Error message:', error.message);
    }
    if (error.response) {
      console.error('API response status:', error.response.status);
    }
  }
});

// IPTV Editor Daily Sync (runs at 3 AM daily) - PLAYLISTS AND CATEGORIES
cron.schedule('0 3 * * *', async () => {
 try {
   console.log('🎬 Starting IPTV Editor daily sync (playlists and categories)...');
   
   // Initialize service (no need to check sync_enabled setting anymore)
   const initialized = await iptvEditorService.initialize();
   if (!initialized) {
     console.log('❌ IPTV Editor service not properly configured - skipping sync');
     return;
   }
   
   // Check if bearer token is configured
   const bearerToken = await iptvEditorService.getSetting('bearer_token');
   if (!bearerToken) {
     console.log('⚠️ IPTV Editor bearer token not configured - skipping sync');
     return;
   }
   
   // Sync playlists
   console.log('📺 Syncing IPTV Editor playlists...');
   const playlistResult = await iptvEditorService.updatePlaylists();
   
   if (playlistResult.success) {
     console.log(`✅ Playlist sync completed: ${playlistResult.counts.inserted} new, ${playlistResult.counts.updated} updated, ${playlistResult.counts.deactivated} deactivated`);
   } else {
     console.log('⚠️ Playlist sync completed with issues');
   }
   
   // Sync categories (needed for user creation)
   console.log('📂 Syncing IPTV Editor categories...');
   try {
     const categoriesResponse = await fetch('http://localhost:' + PORT + '/api/iptv-editor/sync-categories', {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json'
       }
     });
     
     const categoriesResult = await categoriesResponse.json();
     
     if (categoriesResult.success) {
       console.log(`✅ Categories sync completed: ${categoriesResult.data.channels_synced} channels, ${categoriesResult.data.vods_synced} VODs, ${categoriesResult.data.series_synced} series`);
     } else {
       console.log('⚠️ Categories sync failed:', categoriesResult.message);
     }
   } catch (categoryError) {
     console.error('❌ Categories sync error:', categoryError.message);
   }
   
   console.log('✅ IPTV Editor daily sync (playlists and categories) completed successfully');
   
 } catch (error) {
   console.error('❌ IPTV Editor daily sync failed:', error);
   
   // Log specific error details for debugging
   if (error.message) {
     console.error('Error message:', error.message);
   }
   if (error.response) {
     console.error('API response status:', error.response.status);
   }
 }
});



// Initialize IPTV service on startup
iptvService.initialize().catch(console.error);

// NEW - Initialize IPTV Editor service on startup
(async () => {
  try {
    const initialized = await iptvEditorService.initialize();
    if (initialized) {
      console.log('✅ IPTV Editor service initialized successfully');
    } else {
      console.log('⚠️ IPTV Editor service not configured (bearer token missing)');
    }
  } catch (error) {
    console.error('❌ Failed to initialize IPTV Editor service:', error.message);
  }
})();

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Initialize database and start scheduled tasks
async function initializeApp() {
  try {
    await db.testConnection();
    console.log('Database connected successfully');
    
    console.log('🚀 Plex Service imported - hourly sync should start automatically');
    console.log('✅ Plex Service initialized - hourly sync will start automatically');
    
    // Start server
    app.listen(PORT, () => {
      console.log(`JohnsonFlix Manager running on port ${PORT}`);
      console.log(`Access the application at http://localhost:${PORT}`);
      console.log(`📚 Guides available at http://localhost:${PORT}/guide/guide`); // NEW - Guide info
    });

    // Test email service immediately on startup
    console.log('🧪 Testing email service on startup...');
    setTimeout(async () => {
      try {
        if (emailService.transporter) {
          console.log('✅ Email service is ready');
        } else {
          console.log('❌ Email service failed to initialize - check SMTP settings');
        }
      } catch (error) {
        console.error('❌ Email service test error:', error);
      }
    }, 3000);
	


    // ===== AUTOMATED EMAIL SCHEDULING =====
    
    // Hourly check for SPECIFIC DATE emails only (NOT expiration reminders)
    cron.schedule('0 * * * *', async () => {
      const timestamp = new Date().toLocaleString();
      console.log('');
      console.log('🕐='.repeat(50));
      console.log(`🕐 HOURLY SPECIFIC DATE EMAILS STARTED: ${timestamp}`);
      console.log('🕐='.repeat(50));
      
      try {
        // Check email service status
        if (!emailService.transporter) {
          console.log('❌ Email service not initialized - attempting to reinitialize...');
          await emailService.initializeTransporter();
        }

        // Process ONLY specific date scheduled emails
        await emailService.processScheduledEmails();
        
        console.log('🕐='.repeat(50));
        console.log(`🕐 HOURLY SPECIFIC DATE EMAILS COMPLETED: ${new Date().toLocaleString()}`);
        console.log('🕐='.repeat(50));
        console.log('');
      } catch (error) {
        console.error('❌ ERROR IN HOURLY EMAIL PROCESSING:', error);
        console.log('🕐='.repeat(50));
        console.log('');
      }
    });
    console.log('✅ Hourly specific date email scheduler activated');

    // Daily renewal reminders AND expiration reminder schedules (runs at 1 pm UTC 8am Central every day)
    cron.schedule('0 12 * * *', async () => {
      const timestamp = new Date().toLocaleString();
      console.log('');
      console.log('📧='.repeat(50));
      console.log(`📧 DAILY RENEWAL REMINDERS STARTED: ${timestamp}`);
      console.log('📧='.repeat(50));
      
      try {
        // Check email service status
        if (!emailService.transporter) {
          console.log('❌ Email service not initialized - attempting to reinitialize...');
          await emailService.initializeTransporter();
        }


        // Process custom expiration reminder schedules
        await emailService.processExpirationReminders();
        
        console.log('📧='.repeat(50));
        console.log(`📧 DAILY RENEWAL REMINDERS COMPLETED: ${new Date().toLocaleString()}`);
        console.log('📧='.repeat(50));
        console.log('');
      } catch (error) {
        console.error('❌ ERROR IN DAILY RENEWAL REMINDERS:', error);
        console.log('📧='.repeat(50));
        console.log('');
      }
    });
    console.log('✅ Daily renewal reminder scheduler activated (4 PM)');

    // Every 5 minutes check for immediate scheduled emails (for testing and urgent emails)
    cron.schedule('*/5 * * * *', async () => {
      try {
        // Quick check for any emails that should run NOW (within last 5 minutes)
        const now = new Date();
        const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
        
        const urgentSchedules = await db.query(`
          SELECT COUNT(*) as count FROM email_schedules 
          WHERE active = TRUE 
            AND schedule_type = 'specific_date' 
            AND next_run IS NOT NULL
            AND next_run BETWEEN ? AND ?
        `, [fiveMinutesAgo, now]);

        if (urgentSchedules[0].count > 0) {
          console.log(`⚡ Found ${urgentSchedules[0].count} urgent scheduled emails - processing...`);
          await emailService.processScheduledEmails();
        }
      } catch (error) {
        // Silent catch - don't spam logs for this frequent check
      }
    });
    console.log('✅ 5-minute urgent email checker activated');

  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

initializeApp();

module.exports = app;