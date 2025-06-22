// routes/auth.js
const express = require('express');
const router = express.Router();

// Simple auth for now - can be expanded later
router.post('/login', (req, res) => {
  // For now, just return success - you can add proper auth later
  res.json({ success: true, message: 'Authenticated' });
});

module.exports = router;

// routes/subscriptions.js
const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const router = express.Router();

// Get all subscription types
router.get('/', async (req, res) => {
  try {
    const subscriptions = await db.query('SELECT * FROM subscription_types WHERE active = TRUE ORDER BY type, duration_months');
    res.json(subscriptions);
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
});

// Create subscription type
router.post('/', [
  body('name').notEmpty().trim(),
  body('type').isIn(['plex', 'iptv']),
  body('duration_months').isInt({ min: 1 }),
  body('price').isFloat({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, type, duration_months, streams, price } = req.body;

    const result = await db.query(`
      INSERT INTO subscription_types (name, type, duration_months, streams, price)
      VALUES (?, ?, ?, ?, ?)
    `, [name, type, duration_months, streams || null, price]);

    res.status(201).json({ message: 'Subscription type created', id: result.insertId });
  } catch (error) {
    console.error('Error creating subscription type:', error);
    res.status(500).json({ error: 'Failed to create subscription type' });
  }
});

// Update subscription type
router.put('/:id', async (req, res) => {
  try {
    const { name, type, duration_months, streams, price, active } = req.body;

    await db.query(`
      UPDATE subscription_types 
      SET name = ?, type = ?, duration_months = ?, streams = ?, price = ?, active = ?
      WHERE id = ?
    `, [name, type, duration_months, streams, price, active, req.params.id]);

    res.json({ message: 'Subscription type updated' });
  } catch (error) {
    console.error('Error updating subscription type:', error);
    res.status(500).json({ error: 'Failed to update subscription type' });
  }
});

// Delete subscription type
router.delete('/:id', async (req, res) => {
  try {
    await db.query('UPDATE subscription_types SET active = FALSE WHERE id = ?', [req.params.id]);
    res.json({ message: 'Subscription type deactivated' });
  } catch (error) {
    console.error('Error deleting subscription type:', error);
    res.status(500).json({ error: 'Failed to delete subscription type' });
  }
});

module.exports = router;

// routes/email.js
const express = require('express');
const { body, validationResult } = require('express-validator');
const emailService = require('../services/emailService');
const db = require('../config/database');
const router = express.Router();

// Send email
router.post('/send', [
  body('to').isEmail(),
  body('subject').notEmpty(),
  body('body').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { to, cc, bcc, subject, body, userId, templateName } = req.body;

    const result = await emailService.sendEmail(to, subject, body, {
      cc: cc ? cc.split(',').map(email => email.trim()) : [],
      bcc: bcc ? bcc.split(',').map(email => email.trim()) : [],
      userId,
      templateName
    });

    res.json(result);
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// Get email templates
router.get('/templates', async (req, res) => {
  try {
    const templates = await db.query('SELECT * FROM email_templates ORDER BY name');
    res.json(templates);
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Save email template
router.post('/templates', [
  body('name').notEmpty().trim(),
  body('subject').notEmpty(),
  body('body').notEmpty(),
  body('template_type').isIn(['welcome', 'renewal-7day', 'renewal-2day', 'expired', 'manual'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, subject, body, template_type } = req.body;

    const result = await db.query(`
      INSERT INTO email_templates (name, subject, body, template_type)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE subject = ?, body = ?, template_type = ?
    `, [name, subject, body, template_type, subject, body, template_type]);

    res.json({ message: 'Template saved successfully' });
  } catch (error) {
    console.error('Error saving template:', error);
    res.status(500).json({ error: 'Failed to save template' });
  }
});

// Delete email template
router.delete('/templates/:name', async (req, res) => {
  try {
    await db.query('DELETE FROM email_templates WHERE name = ?', [req.params.name]);
    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// Test email connection
router.post('/test', async (req, res) => {
  try {
    const result = await emailService.testEmailConnection();
    res.json(result);
  } catch (error) {
    console.error('Error testing email:', error);
    res.status(500).json({ error: 'Failed to test email connection' });
  }
});

// Get email logs
router.get('/logs', async (req, res) => {
  try {
    const logs = await db.query(`
      SELECT el.*, u.name as user_name 
      FROM email_logs el
      LEFT JOIN users u ON el.user_id = u.id
      ORDER BY el.sent_at DESC
      LIMIT 100
    `);
    res.json(logs);
  } catch (error) {
    console.error('Error fetching email logs:', error);
    res.status(500).json({ error: 'Failed to fetch email logs' });
  }
});

module.exports = router;

// routes/plex.js
const express = require('express');
const plexService = require('../services/plexService');
const router = express.Router();

// Get all servers
router.get('/servers', async (req, res) => {
  try {
    const servers = plexService.getServerList();
    res.json(servers);
  } catch (error) {
    console.error('Error fetching servers:', error);
    res.status(500).json({ error: 'Failed to fetch servers' });
  }
});

// Test server connection
router.post('/servers/:name/test', async (req, res) => {
  try {
    const result = await plexService.testConnection(req.params.name);
    res.json(result);
  } catch (error) {
    console.error('Error testing connection:', error);
    res.status(500).json({ error: 'Failed to test connection' });
  }
});

// Get server libraries
router.get('/servers/:name/libraries', async (req, res) => {
  try {
    const libraries = await plexService.getLibraries(req.params.name);
    res.json(libraries);
  } catch (error) {
    console.error('Error fetching libraries:', error);
    res.status(500).json({ error: 'Failed to fetch libraries' });
  }
});

// Get server users
router.get('/servers/:name/users', async (req, res) => {
  try {
    const users = await plexService.getUsers(req.params.name);
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Create user
router.post('/servers/:name/users', async (req, res) => {
  try {
    const result = await plexService.createUser(req.params.name, req.body);
    res.json(result);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user library access
router.put('/servers/:name/users/:userId/libraries', async (req, res) => {
  try {
    const { libraryIds } = req.body;
    const result = await plexService.setUserLibraryAccess(req.params.name, req.params.userId, libraryIds);
    res.json(result);
  } catch (error) {
    console.error('Error updating library access:', error);
    res.status(500).json({ error: 'Failed to update library access' });
  }
});

// Remove user
router.delete('/servers/:name/users/:userId', async (req, res) => {
  try {
    const result = await plexService.removeUser(req.params.name, req.params.userId);
    res.json(result);
  } catch (error) {
    console.error('Error removing user:', error);
    res.status(500).json({ error: 'Failed to remove user' });
  }
});

// Add server
router.post('/servers', async (req, res) => {
  try {
    const { name, url, token } = req.body;
    const result = await plexService.addServer(name, url, token);
    res.json(result);
  } catch (error) {
    console.error('Error adding server:', error);
    res.status(500).json({ error: 'Failed to add server' });
  }
});

// Sync all libraries
router.post('/sync', async (req, res) => {
  try {
    const result = await plexService.syncAllLibraries();
    res.json(result);
  } catch (error) {
    console.error('Error syncing libraries:', error);
    res.status(500).json({ error: 'Failed to sync libraries' });
  }
});

module.exports = router;

// routes/settings.js
const express = require('express');
const db = require('../config/database');
const router = express.Router();

// Get all settings
router.get('/', async (req, res) => {
  try {
    const settings = await db.query('SELECT * FROM settings');
    const settingsObj = {};
    settings.forEach(setting => {
      let value = setting.setting_value;
      if (setting.setting_type === 'number') value = parseFloat(value);
      if (setting.setting_type === 'boolean') value = value === 'true';
      if (setting.setting_type === 'json') value = JSON.parse(value || '{}');
      settingsObj[setting.setting_key] = value;
    });
    res.json(settingsObj);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update settings
router.put('/', async (req, res) => {
  try {
    const updates = req.body;
    
    for (const [key, value] of Object.entries(updates)) {
      let stringValue = value;
      let type = 'string';
      
      if (typeof value === 'number') {
        type = 'number';
        stringValue = value.toString();
      } else if (typeof value === 'boolean') {
        type = 'boolean';
        stringValue = value.toString();
      } else if (typeof value === 'object') {
        type = 'json';
        stringValue = JSON.stringify(value);
      }
      
      await db.query(`
        INSERT INTO settings (setting_key, setting_value, setting_type)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE setting_value = ?, setting_type = ?
      `, [key, stringValue, type, stringValue, type]);
    }
    
    res.json({ message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

module.exports = router;

// routes/owners.js
const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const router = express.Router();

// Get all owners
router.get('/', async (req, res) => {
  try {
    const owners = await db.query(`
      SELECT o.*, COUNT(u.id) as user_count
      FROM owners o
      LEFT JOIN users u ON o.id = u.owner_id
      GROUP BY o.id
      ORDER BY o.name
    `);
    res.json(owners);
  } catch (error) {
    console.error('Error fetching owners:', error);
    res.status(500).json({ error: 'Failed to fetch owners' });
  }
});

// Create owner
router.post('/', [
  body('name').notEmpty().trim(),
  body('email').isEmail()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email } = req.body;
    
    const result = await db.query('INSERT INTO owners (name, email) VALUES (?, ?)', [name, email]);
    res.status(201).json({ message: 'Owner created successfully', id: result.insertId });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    console.error('Error creating owner:', error);
    res.status(500).json({ error: 'Failed to create owner' });
  }
});

// Update owner
router.put('/:id', [
  body('name').notEmpty().trim(),
  body('email').isEmail()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email } = req.body;
    
    await db.query('UPDATE owners SET name = ?, email = ? WHERE id = ?', [name, email, req.params.id]);
    res.json({ message: 'Owner updated successfully' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    console.error('Error updating owner:', error);
    res.status(500).json({ error: 'Failed to update owner' });
  }
});

// Delete owner
router.delete('/:id', async (req, res) => {
  try {
    // Check if owner has users
    const [userCount] = await db.query('SELECT COUNT(*) as count FROM users WHERE owner_id = ?', [req.params.id]);
    
    if (userCount.count > 0) {
      return res.status(400).json({ error: 'Cannot delete owner with existing users' });
    }
    
    await db.query('DELETE FROM owners WHERE id = ?', [req.params.id]);
    res.json({ message: 'Owner deleted successfully' });
  } catch (error) {
    console.error('Error deleting owner:', error);
    res.status(500).json({ error: 'Failed to delete owner' });
  }
});

module.exports = router;