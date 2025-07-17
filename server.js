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
app.use('/api/iptv-editor', iptvEditorRoutes); // NEW - IPTV Editor routes

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

// NEW - IPTV Editor Daily Sync (runs at 3 AM daily)
cron.schedule('0 3 * * *', async () => {
  try {
    console.log('🎬 Starting IPTV Editor daily sync...');
    
    // Check if IPTV Editor is enabled
    const syncEnabled = await iptvEditorService.getSetting('sync_enabled');
    if (!syncEnabled) {
      console.log('⚠️ IPTV Editor sync is disabled - skipping');
      return;
    }
    
    // Initialize service
    const initialized = await iptvEditorService.initialize();
    if (!initialized) {
      console.log('❌ IPTV Editor service not properly configured - skipping sync');
      return;
    }
    
    // Sync playlists
    console.log('📺 Syncing IPTV Editor playlists...');
    await iptvEditorService.updatePlaylists();
    
    // Sync all enabled users
    console.log('👥 Syncing IPTV Editor users...');
    const enabledUsers = await db.query(`
      SELECT u.id, u.name 
      FROM users u 
      WHERE u.iptv_editor_enabled = TRUE AND u.include_in_iptv_editor = TRUE
    `);
    
    let syncedCount = 0;
    let errorCount = 0;
    
    for (const user of enabledUsers) {
      try {
        const iptvUser = await iptvEditorService.getIPTVEditorUser(user.id);
        if (iptvUser) {
          await iptvEditorService.syncUser(user.id);
          syncedCount++;
        }
      } catch (error) {
        console.error(`Failed to sync IPTV Editor user ${user.id} (${user.name}):`, error.message);
        errorCount++;
      }
    }
    
    console.log(`✅ IPTV Editor sync completed: ${syncedCount} users synced, ${errorCount} errors`);
    
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