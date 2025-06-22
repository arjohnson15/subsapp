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