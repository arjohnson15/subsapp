// routes-email-schedules.js
const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('./database-config'); // Fixed: Use same path as other routes
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
  body('scheduled_time').if(body('schedule_type').equals('specific_date')).matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid time is required (HH:MM format)')
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
      exclude_users_with_setting,
      active
    } = req.body;

    // Calculate next_run based on schedule type
    let next_run = null;
    if (schedule_type === 'specific_date' && scheduled_date && scheduled_time) {
      next_run = `${scheduled_date} ${scheduled_time}:00`;
    }

    const result = await db.query(`
      INSERT INTO email_schedules (
        name, schedule_type, days_before_expiration, subscription_type,
        scheduled_date, scheduled_time, email_template_id, target_tags,
        exclude_users_with_setting, active, next_run
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      name,
      schedule_type,
      days_before_expiration || null,
      subscription_type || null,
      scheduled_date || null,
      scheduled_time || null,
      email_template_id,
      target_tags ? JSON.stringify(target_tags) : null,
      exclude_users_with_setting !== false,
      active !== false,
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

// Update email schedule
router.put('/:id', [
  body('name').notEmpty().trim().withMessage('Name is required'),
  body('schedule_type').isIn(['expiration_reminder', 'specific_date']).withMessage('Invalid schedule type'),
  body('email_template_id').isInt().withMessage('Valid template is required'),
  
  // Conditional validation for expiration reminders
  body('days_before_expiration').if(body('schedule_type').equals('expiration_reminder')).isInt({ min: 1 }).withMessage('Days before expiration must be a positive number'),
  body('subscription_type').if(body('schedule_type').equals('expiration_reminder')).isIn(['plex', 'iptv', 'both']).withMessage('Invalid subscription type'),
  
  // Conditional validation for specific dates
  body('scheduled_date').if(body('schedule_type').equals('specific_date')).isISO8601().withMessage('Valid date is required'),
  body('scheduled_time').if(body('schedule_type').equals('specific_date')).matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Valid time is required (HH:MM format)')
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
      exclude_users_with_setting,
      active
    } = req.body;

    // Calculate next_run based on schedule type
    let next_run = null;
    if (schedule_type === 'specific_date' && scheduled_date && scheduled_time) {
      next_run = `${scheduled_date} ${scheduled_time}:00`;
    }

    await db.query(`
      UPDATE email_schedules SET
        name = ?, schedule_type = ?, days_before_expiration = ?, subscription_type = ?,
        scheduled_date = ?, scheduled_time = ?, email_template_id = ?, target_tags = ?,
        exclude_users_with_setting = ?, active = ?, next_run = ?
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
      exclude_users_with_setting !== false,
      active !== false,
      next_run,
      req.params.id
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
    
    // Parse target tags
    let targetTags = null;
    if (schedule.target_tags) {
      try {
        targetTags = JSON.parse(schedule.target_tags);
      } catch (e) {
        targetTags = [];
      }
    }

    // Get users based on schedule criteria
    let users = [];
    if (schedule.schedule_type === 'expiration_reminder') {
      users = await getExpiringUsers(schedule.days_before_expiration, schedule.subscription_type, targetTags, schedule.exclude_users_with_setting);
    } else {
      users = await getAllTargetUsers(targetTags, schedule.exclude_users_with_setting);
    }

    res.json({
      message: 'Test run completed',
      schedule_name: schedule.name,
      template_name: schedule.template_name,
      target_users_count: users.length,
      target_users: users.map(u => ({ name: u.name, email: u.email }))
    });
  } catch (error) {
    console.error('Error testing email schedule:', error);
    res.status(500).json({ error: 'Failed to test email schedule' });
  }
});

// Helper function to get expiring users
async function getExpiringUsers(daysBefore, subscriptionType, targetTags, excludeAutomated) {
  let subscriptionFilter = '';
  if (subscriptionType === 'plex') {
    subscriptionFilter = `AND (s.subscription_type_id IS NULL OR st.type = 'plex')`;
  } else if (subscriptionType === 'iptv') {
    subscriptionFilter = `AND st.type = 'iptv'`;
  }
  // 'both' means no additional filter

  let tagFilter = '';
  if (targetTags && targetTags.length > 0) {
    const tagConditions = targetTags.map(() => 'JSON_CONTAINS(u.tags, ?)').join(' OR ');
    tagFilter = `AND (${tagConditions})`;
  }

  let excludeFilter = '';
  if (excludeAutomated) {
    excludeFilter = 'AND u.exclude_automated_emails = FALSE';
  }

  const query = `
    SELECT DISTINCT u.*, o.name as owner_name, o.email as owner_email,
           s.expiration_date, st.name as subscription_name, st.type as subscription_type
    FROM users u
    LEFT JOIN owners o ON u.owner_id = o.id
    LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status = 'active'
    LEFT JOIN subscription_types st ON s.subscription_type_id = st.id
    WHERE s.expiration_date = DATE_ADD(CURDATE(), INTERVAL ? DAY)
    ${subscriptionFilter}
    ${tagFilter}
    ${excludeFilter}
    ORDER BY u.name
  `;

  const params = [daysBefore];
  if (targetTags && targetTags.length > 0) {
    targetTags.forEach(tag => params.push(`"${tag}"`));
  }

  return await db.query(query, params);
}

// Helper function to get all target users for specific date emails
async function getAllTargetUsers(targetTags, excludeAutomated) {
  let tagFilter = '';
  if (targetTags && targetTags.length > 0) {
    const tagConditions = targetTags.map(() => 'JSON_CONTAINS(u.tags, ?)').join(' OR ');
    tagFilter = `AND (${tagConditions})`;
  }

  let excludeFilter = '';
  if (excludeAutomated) {
    excludeFilter = 'AND u.exclude_automated_emails = FALSE';
  }

  const query = `
    SELECT u.*, o.name as owner_name, o.email as owner_email
    FROM users u
    LEFT JOIN owners o ON u.owner_id = o.id
    WHERE 1=1
    ${tagFilter}
    ${excludeFilter}
    ORDER BY u.name
  `;

  const params = [];
  if (targetTags && targetTags.length > 0) {
    targetTags.forEach(tag => params.push(`"${tag}"`));
  }

  return await db.query(query, params);
}

module.exports = router;