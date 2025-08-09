// routes-email-schedules.js
const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('./database-config');
const emailService = require('./email-service');
const router = express.Router();

// Get all email schedules
router.get('/', async (req, res) => {
  try {
    // Check if email_schedules table exists, if not return empty array
    const schedules = await db.query(`
      SELECT es.*, et.name as template_name, et.subject as template_subject
      FROM email_schedules es
      LEFT JOIN email_templates et ON es.email_template_id = et.id
      ORDER BY es.created_at DESC
    `);
    
    // Parse JSON fields
schedules.forEach(schedule => {
  if (schedule.target_tags) {
    try {
      schedule.target_tags = JSON.parse(schedule.target_tags);
    } catch (e) {
      schedule.target_tags = [];
    }
  }
  
  // NEW: Parse target_owners
  if (schedule.target_owners) {
    try {
      schedule.target_owners = JSON.parse(schedule.target_owners);
    } catch (e) {
      schedule.target_owners = [];
    }
  }
  
  // NEW: Parse target_subscription_types
  if (schedule.target_subscription_types) {
    try {
      schedule.target_subscription_types = JSON.parse(schedule.target_subscription_types);
    } catch (e) {
      schedule.target_subscription_types = [];
    }
  }
});
    
    res.json(schedules);
  } catch (error) {
    console.error('Error fetching email schedules:', error);
    
    // If table doesn't exist, return empty array instead of error
    if (error.code === 'ER_NO_SUCH_TABLE') {
      console.warn('email_schedules table does not exist - returning empty array');
      res.json([]);
    } else {
      res.status(500).json({ error: 'Failed to fetch email schedules' });
    }
  }
});

// Create new email schedule
router.post('/', [
  body('name').notEmpty().trim().withMessage('Name is required'),
  body('schedule_type').isIn(['expiration_reminder', 'specific_date']).withMessage('Invalid schedule type'),
  body('email_template_id').isInt().withMessage('Valid template is required'),
  
  // Conditional validation for expiration reminders
  body('days_before_expiration').if(body('schedule_type').equals('expiration_reminder')).isInt({ min: 1 }).withMessage('Days before expiration must be a positive number'),
  body('subscription_type').if(body('schedule_type').equals('expiration_reminder')).isIn(['plex', 'iptv', 'both']).withMessage('Invalid subscription type'),
  
  // Conditional validation for specific dates
  body('scheduled_date').if(body('schedule_type').equals('specific_date')).isISO8601().withMessage('Valid date is required'),
  body('scheduled_time').if(body('schedule_type').equals('specific_date')).matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid time is required (HH:MM format)'),
  
  // NEW: Optional validation for filtering arrays
  body('target_owners').optional().isArray().withMessage('Target owners must be an array'),
  body('target_subscription_types').optional().isArray().withMessage('Target subscription types must be an array')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

  const {
    name,
    schedule_type,
    days_before_expiration,
    subscription_type,
    scheduled_date,
    scheduled_time,
    email_template_id,
    target_tags,
    target_owners,        // NEW
    target_subscription_types,  // NEW
    exclude_users_with_setting,
    active
  } = req.body;

// Calculate next_run based on schedule type  
let next_run = null;
if (schedule_type === 'specific_date' && scheduled_date && scheduled_time) {
  // Convert Central Time input to UTC for storage
  const dateOnly = scheduled_date.split('T')[0];
  const centralDateTime = `${dateOnly}T${scheduled_time}:00`;
  const centralDate = new Date(centralDateTime);
  
  // Assume Central Time and convert to UTC
  // Central Time is UTC-6 (CST) or UTC-5 (CDT)
  const now = new Date();
  const isDST = now.getMonth() >= 2 && now.getMonth() <= 10; // Rough DST check
  const offsetHours = isDST ? 5 : 6; // CDT = UTC-5, CST = UTC-6
  
  const utcDate = new Date(centralDate.getTime() + (offsetHours * 60 * 60 * 1000));
  next_run = utcDate.toISOString().slice(0, 19).replace('T', ' ');
  
  console.log(`🕐 Converting Central Time ${dateOnly} ${scheduled_time} to UTC: ${next_run}`);
}

  const result = await db.query(`
    INSERT INTO email_schedules (
      name, schedule_type, days_before_expiration, subscription_type,
      scheduled_date, scheduled_time, email_template_id, target_tags,
      target_owners, target_subscription_types,
      exclude_users_with_setting, active, next_run
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    name,
    schedule_type,
    days_before_expiration || null,
    subscription_type || null,
    scheduled_date || null,
    scheduled_time || null,
    email_template_id,
    target_tags ? JSON.stringify(target_tags) : null,
    target_owners ? JSON.stringify(target_owners) : null,        // NEW
    target_subscription_types ? JSON.stringify(target_subscription_types) : null,  // NEW
    exclude_users_with_setting || false,
    active || false,
    next_run
  ]);

    res.json({ 
      message: 'Email schedule created successfully',
      id: result.insertId
    });
  } catch (error) {
    console.error('Error creating email schedule:', error);
    res.status(500).json({ error: 'Failed to create email schedule' });
  }
});

// Update existing email schedule
router.put('/:id', [
  body('name').notEmpty().trim().withMessage('Name is required'),
  body('schedule_type').isIn(['expiration_reminder', 'specific_date']).withMessage('Invalid schedule type'),
  body('email_template_id').isInt().withMessage('Valid template is required'),
  body('target_owners').optional().isArray().withMessage('Target owners must be an array'),
  body('target_subscription_types').optional().isArray().withMessage('Target subscription types must be an array')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const scheduleId = req.params.id;
    const {
      name,
      schedule_type,
      days_before_expiration,
      subscription_type,
      scheduled_date,
      scheduled_time,
      email_template_id,
      target_tags,
      target_owners,
      target_subscription_types,
      exclude_users_with_setting,
      active
    } = req.body;

    // Calculate next_run (same logic as POST)
    let next_run = null;
    if (schedule_type === 'specific_date' && scheduled_date && scheduled_time) {
      const dateOnly = scheduled_date.split('T')[0];
      const centralDateTime = `${dateOnly}T${scheduled_time}:00`;
      const centralDate = new Date(centralDateTime);
      const now = new Date();
      const isDST = now.getMonth() >= 2 && now.getMonth() <= 10;
      const offsetHours = isDST ? 5 : 6;
      const utcDate = new Date(centralDate.getTime() + (offsetHours * 60 * 60 * 1000));
      next_run = utcDate.toISOString().slice(0, 19).replace('T', ' ');
    }

    await db.query(`
      UPDATE email_schedules SET
        name = ?, schedule_type = ?, days_before_expiration = ?, subscription_type = ?,
        scheduled_date = ?, scheduled_time = ?, email_template_id = ?, target_tags = ?,
        target_owners = ?, target_subscription_types = ?,
        exclude_users_with_setting = ?, active = ?, next_run = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      name,
      schedule_type,
      days_before_expiration || null,
      subscription_type || null,
      scheduled_date || null,
      scheduled_time || null,
      email_template_id,
      target_tags ? JSON.stringify(target_tags) : null,
      target_owners ? JSON.stringify(target_owners) : null,
      target_subscription_types ? JSON.stringify(target_subscription_types) : null,
      exclude_users_with_setting || false,
      active || false,
      next_run,
      scheduleId
    ]);

    res.json({ message: 'Email schedule updated successfully' });
  } catch (error) {
    console.error('Error updating email schedule:', error);
    res.status(500).json({ error: 'Failed to update email schedule' });
  }
});

// Delete email schedule
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM email_schedules WHERE id = ?', [req.params.id]);
    res.json({ message: 'Email schedule deleted successfully' });
  } catch (error) {
    console.error('Error deleting email schedule:', error);
    res.status(500).json({ error: 'Failed to delete email schedule' });
  }
});

// Toggle schedule active status
router.patch('/:id/toggle', async (req, res) => {
  try {
    await db.query('UPDATE email_schedules SET active = NOT active WHERE id = ?', [req.params.id]);
    res.json({ message: 'Email schedule status toggled successfully' });
  } catch (error) {
    console.error('Error toggling email schedule:', error);
    res.status(500).json({ error: 'Failed to toggle email schedule' });
  }
});

// Test run a specific schedule
router.post('/:id/test', async (req, res) => {
  try {
    const scheduleId = req.params.id;
    
    // Get the schedule details
    const schedules = await db.query(`
      SELECT es.*, et.subject, et.body, et.name as template_name
      FROM email_schedules es
      LEFT JOIN email_templates et ON es.email_template_id = et.id
      WHERE es.id = ?
    `, [scheduleId]);

    if (schedules.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    const schedule = schedules[0];
    console.log(`🧪 Testing schedule: ${schedule.name} (ID: ${scheduleId})`);

    // Force run this specific schedule
    await emailService.processIndividualSchedule(schedule);

    res.json({ 
      message: 'Schedule test run completed',
      schedule: schedule.name,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error testing schedule:', error);
    res.status(500).json({ error: 'Failed to test schedule' });
  }
});

// MANUAL TRIGGER ENDPOINT - Process all scheduled emails NOW
router.post('/trigger-all', async (req, res) => {
  try {
    console.log('🚀 MANUAL TRIGGER: Processing all scheduled emails...');
    
    // Check email service status
    if (!emailService.transporter) {
      console.log('❌ Email service not initialized - attempting to reinitialize...');
      await emailService.initializeTransporter();
    }

    // Process all scheduled emails
    await emailService.processScheduledEmails();
    
    res.json({ 
      success: true,
      message: 'All scheduled emails processed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error in manual trigger:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to process scheduled emails',
      details: error.message
    });
  }
});

// DEBUG ENDPOINT - Check email automation status
router.get('/debug/status', async (req, res) => {
  try {
    // Get email service status
    const emailServiceStatus = {
      transporterReady: !!emailService.transporter,
      smtpSettings: await emailService.getSMTPSettings()
    };

    // Get current time info
    const now = new Date();
    const timeInfo = {
      serverTime: now.toISOString(),
      localTime: now.toLocaleString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };

    // Get schedules that should run soon
    const upcomingSchedules = await db.query(`
      SELECT es.*, et.name as template_name, et.subject
      FROM email_schedules es
      LEFT JOIN email_templates et ON es.email_template_id = et.id
      WHERE es.active = TRUE
        AND es.schedule_type = 'specific_date'
        AND es.next_run IS NOT NULL
        AND es.next_run >= ?
      ORDER BY es.next_run ASC
      LIMIT 5
    `, [now]);

    // Get schedules that should have run already but haven't
    const missedSchedules = await db.query(`
      SELECT es.*, et.name as template_name, et.subject
      FROM email_schedules es
      LEFT JOIN email_templates et ON es.email_template_id = et.id
      WHERE es.active = TRUE
        AND es.schedule_type = 'specific_date'
        AND es.next_run IS NOT NULL
        AND es.next_run <= ?
        AND (es.last_run IS NULL OR es.last_run < es.next_run)
      ORDER BY es.next_run ASC
    `, [now]);

    res.json({
      success: true,
      emailService: emailServiceStatus,
      timeInfo: timeInfo,
      upcomingSchedules: upcomingSchedules,
      missedSchedules: missedSchedules,
      totalActiveSchedules: await db.query('SELECT COUNT(*) as count FROM email_schedules WHERE active = TRUE'),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting debug status:', error);
    res.status(500).json({ error: 'Failed to get debug status' });
  }
});

// Preview users for schedule filters
router.post('/preview-users', async (req, res) => {
  try {
    const { target_tags, target_owners, target_subscription_types, exclude_users_with_setting } = req.body;

    console.log('🔍 Preview request:', req.body);

    // Get all users with their relationships
    let query = `
      SELECT DISTINCT u.id, u.name, u.email, u.tags, u.owner_id, u.exclude_automated_emails,
             o.name as owner_name,
             s.subscription_type_id,
             CASE 
               WHEN s.subscription_type_id IS NULL THEN 'FREE Plex Access'
               ELSE st.name 
             END as subscription_name
      FROM users u
      LEFT JOIN owners o ON u.owner_id = o.id
      LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status = 'active'
      LEFT JOIN subscription_types st ON s.subscription_type_id = st.id
      WHERE 1=1
    `;

    const params = [];

    // Apply exclude automated emails filter
    if (exclude_users_with_setting) {
      query += ` AND u.exclude_automated_emails = FALSE`;
    }

    const allUsers = await db.query(query, params);
    console.log(`📊 Found ${allUsers.length} users before filtering`);

    // Apply client-side filtering for tags, owners, and subscription types
    let filteredUsers = allUsers;

    // Filter by tags
    if (target_tags && target_tags.length > 0 && target_tags[0] !== '') {
      filteredUsers = filteredUsers.filter(user => {
        const userTags = user.tags ? JSON.parse(user.tags) : [];
        return target_tags.some(tag => userTags.includes(tag));
      });
      console.log(`📊 After tag filtering: ${filteredUsers.length} users`);
    }

    // Filter by owners
    if (target_owners && target_owners.length > 0 && target_owners[0] !== '') {
      filteredUsers = filteredUsers.filter(user => {
        return target_owners.includes(user.owner_id);
      });
      console.log(`📊 After owner filtering: ${filteredUsers.length} users`);
    }

    // Filter by subscription types
    if (target_subscription_types && target_subscription_types.length > 0 && target_subscription_types[0] !== '') {
      filteredUsers = filteredUsers.filter(user => {
        // Handle 'free' subscription type (null subscription_type_id)
        if (target_subscription_types.includes('free') && user.subscription_type_id === null) {
          return true;
        }
        return target_subscription_types.includes(user.subscription_type_id);
      });
      console.log(`📊 After subscription type filtering: ${filteredUsers.length} users`);
    }

    // Parse tags for frontend display
    filteredUsers.forEach(user => {
      if (user.tags) {
        try {
          user.tags = JSON.parse(user.tags);
        } catch (e) {
          user.tags = [];
        }
      } else {
        user.tags = [];
      }
    });

    res.json({
      success: true,
      users: filteredUsers,
      total: filteredUsers.length
    });

  } catch (error) {
    console.error('❌ Error previewing users:', error);
    res.status(500).json({ success: false, message: 'Failed to preview users' });
  }
});

// DEBUG ENDPOINT - Check what users would receive emails for a schedule
router.get('/:id/debug/preview', async (req, res) => {
  try {
    const scheduleId = req.params.id;
    
    // Get the schedule details
    const schedules = await db.query(`
      SELECT es.*, et.subject, et.body, et.name as template_name
      FROM email_schedules es
      LEFT JOIN email_templates et ON es.email_template_id = et.id
      WHERE es.id = ?
    `, [scheduleId]);

    if (schedules.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    const schedule = schedules[0];
    let targetUsers = [];

    // Helper function to safely parse target_tags
    const parseTargetTags = (targetTags) => {
      if (!targetTags) return null;
      try {
        return JSON.parse(targetTags);
      } catch (e) {
        return null;
      }
    };

    if (schedule.schedule_type === 'expiration_reminder') {
      targetUsers = await emailService.getExpiringUsers(
        schedule.days_before_expiration,
        schedule.subscription_type,
        parseTargetTags(schedule.target_tags),
        schedule.exclude_users_with_setting
      );
    } else if (schedule.schedule_type === 'specific_date') {
      targetUsers = await emailService.getAllTargetUsers(
        parseTargetTags(schedule.target_tags),
        schedule.exclude_users_with_setting
      );
    }

    res.json({
      success: true,
      schedule: {
        id: schedule.id,
        name: schedule.name,
        type: schedule.schedule_type,
        next_run: schedule.next_run,
        last_run: schedule.last_run
      },
      targetUsers: targetUsers.map(user => ({
        id: user.id,
        name: user.name,
        email: user.email,
        tags: user.tags
      })),
      userCount: targetUsers.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error previewing schedule:', error);
    res.status(500).json({ error: 'Failed to preview schedule' });
  }
});

module.exports = router;