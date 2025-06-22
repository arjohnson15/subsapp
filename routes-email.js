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