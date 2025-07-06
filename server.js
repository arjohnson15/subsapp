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

// Serve main application
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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
    
    // Hourly check for scheduled emails (runs every hour at minute 0)
    cron.schedule('0 * * * *', async () => {
      const timestamp = new Date().toLocaleString();
      console.log('');
      console.log('🕐='.repeat(50));
      console.log(`🕐 HOURLY EMAIL AUTOMATION STARTED: ${timestamp}`);
      console.log('🕐='.repeat(50));
      
      try {
        // Check email service status
        if (!emailService.transporter) {
          console.log('❌ Email service not initialized - attempting to reinitialize...');
          await emailService.initializeTransporter();
        }

        // Process scheduled emails
        await emailService.processScheduledEmails();
        
        console.log('🕐='.repeat(50));
        console.log(`🕐 HOURLY EMAIL AUTOMATION COMPLETED: ${new Date().toLocaleString()}`);
        console.log('🕐='.repeat(50));
        console.log('');
      } catch (error) {
        console.error('❌ ERROR IN HOURLY EMAIL AUTOMATION:', error);
        console.log('🕐='.repeat(50));
        console.log('');
      }
    });
    console.log('✅ Hourly email scheduler activated');

    // Daily renewal reminders (runs at 9 AM every day)
    cron.schedule('0 9 * * *', async () => {
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

        const result = await emailService.sendRenewalReminders();
        
        if (result.success) {
          console.log(`✅ Renewal reminders completed: ${result.sent} emails sent`);
        } else {
          console.log(`❌ Renewal reminders failed: ${result.error}`);
        }
        
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
    console.log('✅ Daily renewal reminder scheduler activated');

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