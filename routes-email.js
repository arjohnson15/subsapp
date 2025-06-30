const express = require('express');
const { body, validationResult } = require('express-validator');
const emailService = require('./email-service');
const db = require('./database-config');
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
      // FIXED: Handle cc and bcc as arrays (already processed by frontend)
      cc: Array.isArray(cc) ? cc : (cc ? cc.split(',').map(email => email.trim()) : []),
      bcc: Array.isArray(bcc) ? bcc : (bcc ? bcc.split(',').map(email => email.trim()) : []),
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
  body('template_type').isIn(['welcome', 'renewal-7day', 'renewal-2day', 'expired', 'manual', 'custom'])
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

// Update existing template
router.put('/templates/:name', [
  body('subject').notEmpty(),
  body('body').notEmpty(),
  body('template_type').isIn(['welcome', 'renewal-7day', 'renewal-2day', 'expired', 'manual', 'custom'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { subject, body, template_type } = req.body;
    const templateName = req.params.name;

    await db.query(`
      UPDATE email_templates 
      SET subject = ?, body = ?, template_type = ?, updated_at = CURRENT_TIMESTAMP
      WHERE name = ?
    `, [subject, body, template_type, templateName]);

    res.json({ message: 'Template updated successfully' });
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ error: 'Failed to update template' });
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

// Send test email
router.post('/send-test', async (req, res) => {
  try {
    const { to } = req.body;
    if (!to) {
      return res.status(400).json({ error: 'Recipient email is required' });
    }

    const testSubject = 'JohnsonFlix - Test Email';
    const testBody = `
      <h2 style="color: #8e24aa;">Test Email Successful!</h2>
      <p>This is a test email from your JohnsonFlix Manager application.</p>
      <p>If you received this email, your email configuration is working correctly.</p>
      <p>Sent at: ${new Date().toLocaleString()}</p>
      <br>
      <p>Best regards,<br>JohnsonFlix Team</p>
    `;

    const result = await emailService.sendEmail(to, testSubject, testBody, {
      templateName: 'Test Email'
    });

    res.json(result);
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({ error: 'Failed to send test email' });
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

// Send bulk email
router.post('/send-bulk', [
  body('tags').isArray().withMessage('Tags must be an array'),
  body('subject').notEmpty(),
  body('body').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { tags, subject, body, templateName, bcc } = req.body;

    const result = await emailService.sendBulkEmail(tags, subject, body, {
      templateName,
      bcc: bcc ? bcc.split(',').map(email => email.trim()).filter(email => email) : []
    });

    res.json(result);
  } catch (error) {
    console.error('Error sending bulk email:', error);
    res.status(500).json({ error: 'Failed to send bulk email' });
  }
});

// Get user data for email personalization
router.get('/user-data/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    
    const users = await db.query(`
      SELECT u.*, o.name as owner_name, o.email as owner_email,
             GROUP_CONCAT(CONCAT(st.name, ':', s.expiration_date) SEPARATOR '|') as subscriptions
      FROM users u
      LEFT JOIN owners o ON u.owner_id = o.id
      LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status = 'active'
      LEFT JOIN subscription_types st ON s.subscription_type_id = st.id
      WHERE u.id = ?
      GROUP BY u.id
    `, [userId]);

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[0];
    
    // Parse subscription data
    if (user.subscriptions) {
      const subscriptionPairs = user.subscriptions.split('|');
      subscriptionPairs.forEach(pair => {
        const [type, expiration] = pair.split(':');
        if (type.toLowerCase().includes('plex')) {
          user.plex_expiration = expiration;
          user.subscription_type = type;
        } else if (type.toLowerCase().includes('iptv')) {
          user.iptv_expiration = expiration;
          if (!user.subscription_type) user.subscription_type = type;
        }
      });
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.status(500).json({ error: 'Failed to fetch user data' });
  }
});

// Trigger manual renewal reminders
router.post('/send-renewal-reminders', async (req, res) => {
  try {
    const result = await emailService.sendRenewalReminders();
    res.json(result);
  } catch (error) {
    console.error('Error sending renewal reminders:', error);
    res.status(500).json({ error: 'Failed to send renewal reminders' });
  }
});

module.exports = router;