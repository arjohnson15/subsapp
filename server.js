// server.js - REPLACEMENT FILE
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

    // ===== AUTOMATED EMAIL SCHEDULING =====
    // Hourly check for scheduled emails (runs every hour at minute 0)
    cron.schedule('0 * * * *', async () => {
      console.log('🕐 Hourly automated email check started at', new Date().toLocaleString());
      try {
        await emailService.processScheduledEmails();
      } catch (error) {
        console.error('❌ Error in hourly email automation:', error);
      }
    });
    console.log('✅ Hourly email scheduler activated');

    // Daily renewal reminders (runs at 9 AM every day as backup)
    cron.schedule('0 9 * * *', async () => {
      console.log('📧 Running daily renewal reminders at', new Date().toLocaleString());
      try {
        await emailService.sendRenewalReminders();
      } catch (error) {
        console.error('❌ Error in daily renewal reminders:', error);
      }
    });
    console.log('✅ Daily renewal reminder scheduler activated');

  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

initializeApp();

module.exports = app;