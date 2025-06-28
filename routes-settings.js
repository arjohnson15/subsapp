const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./database-config');
const router = express.Router();

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Create unique filename with original extension
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const fieldname = file.fieldname;
    
    // Use descriptive names for branding files
    if (fieldname === 'logo') {
      cb(null, `logo-${uniqueSuffix}${ext}`);
    } else if (fieldname === 'favicon') {
      cb(null, `favicon-${uniqueSuffix}${ext}`);
    } else {
      cb(null, `${fieldname}-${uniqueSuffix}${ext}`);
    }
  }
});

// File filter for images only
const fileFilter = (req, file, cb) => {
  // Check if file is an image
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

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

// Update settings (existing endpoint for non-file settings)
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

// Upload branding files (logo and favicon)
router.post('/upload', upload.fields([
  { name: 'logo', maxCount: 1 },
  { name: 'favicon', maxCount: 1 }
]), async (req, res) => {
  try {
    const files = req.files;
    const updates = {};

    // Handle logo upload
    if (files.logo && files.logo[0]) {
      const logoPath = `/uploads/${files.logo[0].filename}`;
      updates.app_logo = logoPath;
      
      // Delete old logo file if exists
      await deleteOldBrandingFile('app_logo');
    }

    // Handle favicon upload
    if (files.favicon && files.favicon[0]) {
      const faviconPath = `/uploads/${files.favicon[0].filename}`;
      updates.app_favicon = faviconPath;
      
      // Delete old favicon file if exists
      await deleteOldBrandingFile('app_favicon');
    }

    // Update database with new file paths
    for (const [key, value] of Object.entries(updates)) {
      await db.query(`
        INSERT INTO settings (setting_key, setting_value, setting_type)
        VALUES (?, ?, 'string')
        ON DUPLICATE KEY UPDATE setting_value = ?
      `, [key, value, value]);
    }

    res.json({ 
      message: 'Files uploaded successfully',
      files: updates
    });
  } catch (error) {
    console.error('Error uploading files:', error);
    res.status(500).json({ error: 'Failed to upload files' });
  }
});

// Delete branding file
router.delete('/upload/:type', async (req, res) => {
  try {
    const { type } = req.params; // 'logo' or 'favicon'
    const settingKey = type === 'logo' ? 'app_logo' : 'app_favicon';
    
    // Delete the file and database entry
    await deleteOldBrandingFile(settingKey);
    
    // Clear the setting in database
    await db.query(`
      INSERT INTO settings (setting_key, setting_value, setting_type)
      VALUES (?, '', 'string')
      ON DUPLICATE KEY UPDATE setting_value = ''
    `, [settingKey]);

    res.json({ message: `${type} deleted successfully` });
  } catch (error) {
    console.error(`Error deleting ${req.params.type}:`, error);
    res.status(500).json({ error: `Failed to delete ${req.params.type}` });
  }
});

// Helper function to delete old branding files
async function deleteOldBrandingFile(settingKey) {
  try {
    // Get current file path from database
    const [currentSetting] = await db.query(
      'SELECT setting_value FROM settings WHERE setting_key = ?',
      [settingKey]
    );

    if (currentSetting && currentSetting.setting_value && currentSetting.setting_value.startsWith('/uploads/')) {
      const oldFilePath = path.join(__dirname, 'public', currentSetting.setting_value);
      
      // Delete old file if it exists
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
        console.log(`Deleted old file: ${oldFilePath}`);
      }
    }
  } catch (error) {
    console.error('Error deleting old branding file:', error);
    // Don't throw error - this is cleanup, shouldn't block upload
  }
}

module.exports = router;