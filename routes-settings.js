const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./database-config');
const router = express.Router();

function safeJsonParse(data, defaultValue = []) {
    // If data is null or undefined, return default
    if (!data || data === null || data === 'null') {
        return defaultValue;
    }
    
    // If data is already an array, return it
    if (Array.isArray(data)) {
        return data;
    }
    
    // If data is a string, try to parse it
    if (typeof data === 'string') {
        if (data.trim() === '') {
            return defaultValue;
        }
        try {
            const parsed = JSON.parse(data);
            return Array.isArray(parsed) ? parsed : defaultValue;
        } catch (e) {
            console.warn(`⚠️ Invalid JSON found: "${data}", using default:`, defaultValue);
            return defaultValue;
        }
    }
    
    // For any other data type, return default
    console.warn(`⚠️ Unexpected data type for JSON parsing:`, typeof data, data);
    return defaultValue;
}

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
    
    // ADD THESE LINES:
    const emailService = require('./email-service');
    await emailService.reinitialize();
    console.log('📧 Email service reinitialized after settings update');
    
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

// ========================================
// IPTV CHANNEL GROUPS ENDPOINTS
// ========================================

// Get all channel groups
router.get('/channel-groups', async (req, res) => {
    try {
        const rows = await db.query(`
            SELECT id, name, description, bouquet_ids, 
                   iptv_editor_channels, iptv_editor_movies, iptv_editor_series,
                   is_active, created_at, updated_at
            FROM iptv_channel_groups 
            WHERE is_active = true 
            ORDER BY name ASC
        `);
        
        // Parse JSON fields SAFELY - prevents crashes from malformed JSON
        const channelGroups = rows.map(group => ({
            ...group,
            bouquet_ids: safeJsonParse(group.bouquet_ids, []),
            iptv_editor_channels: safeJsonParse(group.iptv_editor_channels, []),
            iptv_editor_movies: safeJsonParse(group.iptv_editor_movies, []),
            iptv_editor_series: safeJsonParse(group.iptv_editor_series, [])
        }));
        
        console.log(`✅ Retrieved ${channelGroups.length} channel groups with IPTV Editor categories`);
        
        res.json({
            success: true,
            data: channelGroups,
            message: `Retrieved ${channelGroups.length} channel groups`
        });
        
    } catch (error) {
        console.error('❌ Error getting channel groups:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get channel groups: ' + error.message
        });
    }
});

// Create new channel group
router.post('/channel-groups', async (req, res) => {
    try {
        const { name, description, bouquet_ids = [], iptv_editor_channels = [], iptv_editor_movies = [], iptv_editor_series = [] } = req.body;
        
        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Group name is required'
            });
        }
        
// Check if name already exists  
const existing = await db.query(
    'SELECT id FROM iptv_channel_groups WHERE name = ? AND is_active = true',
    [name.trim()]
);

console.log(`🔍 CREATE - Name check for "${name}": found ${existing.length} existing groups`);
if (existing.length > 0) {
    console.log(`❌ Duplicate name found - existing group ID: ${existing[0].id}, name: "${existing[0].name || 'unknown'}"`);
    return res.status(400).json({
        success: false,
        message: `A channel group with this name already exists (ID: ${existing[0].id})`
    });
}
console.log(`✅ Name "${name}" is available for creation`);
        
        // Insert new channel group with IPTV Editor categories
        const result = await db.query(`
            INSERT INTO iptv_channel_groups 
            (name, description, bouquet_ids, iptv_editor_channels, iptv_editor_movies, iptv_editor_series, is_active) 
            VALUES (?, ?, ?, ?, ?, ?, true)
        `, [
            name.trim(),
            description || '',
            JSON.stringify(bouquet_ids),
            JSON.stringify(iptv_editor_channels),
            JSON.stringify(iptv_editor_movies),
            JSON.stringify(iptv_editor_series)
        ]);
        
        console.log(`✅ Created channel group: ${name} (ID: ${result.insertId})`);
        console.log(`   - Bouquets: ${bouquet_ids.length}`);
        console.log(`   - IPTV Editor Channels: ${iptv_editor_channels.length}`);
        console.log(`   - IPTV Editor Movies: ${iptv_editor_movies.length}`);
        console.log(`   - IPTV Editor Series: ${iptv_editor_series.length}`);
        
        res.json({
            success: true,
            message: 'Channel group created successfully',
            data: {
                id: result.insertId,
                name: name.trim(),
                description,
                bouquet_ids,
                iptv_editor_channels,
                iptv_editor_movies,
                iptv_editor_series
            }
        });
        
    } catch (error) {
        console.error('❌ Error creating channel group:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create channel group: ' + error.message
        });
    }
});

// Update channel group
router.put('/channel-groups/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, bouquet_ids = [], iptv_editor_channels = [], iptv_editor_movies = [], iptv_editor_series = [] } = req.body;
        
        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Group name is required'
            });
        }
        
        // FIXED: Check if name already exists (excluding current record)
const existing = await db.query(
    'SELECT id, name FROM iptv_channel_groups WHERE name = ? AND id != ? AND is_active = true',
    [name.trim(), parseInt(id)]  // ← Make sure this parseInt(id) is there!
);
        
        if (existing.length > 0) {
            console.log(`❌ Name validation failed - existing group found:`, existing[0]);
            console.log(`   Current ID: ${id} (type: ${typeof id})`);
            console.log(`   Existing ID: ${existing[0].id} (type: ${typeof existing[0].id})`);
            return res.status(400).json({
                success: false,
                message: 'A channel group with this name already exists'
            });
        }
        
        console.log(`✅ Name validation passed for group ID: ${id}, name: "${name}"`);
        
        // Update channel group with IPTV Editor categories
        const result = await db.query(`
            UPDATE iptv_channel_groups 
            SET name = ?, description = ?, bouquet_ids = ?, 
                iptv_editor_channels = ?, iptv_editor_movies = ?, iptv_editor_series = ?,
                updated_at = CURRENT_TIMESTAMP 
            WHERE id = ? AND is_active = true
        `, [
            name.trim(),
            description || '',
            JSON.stringify(bouquet_ids),
            JSON.stringify(iptv_editor_channels),
            JSON.stringify(iptv_editor_movies),
            JSON.stringify(iptv_editor_series),
            parseInt(id)
        ]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Channel group not found'
            });
        }
        
        console.log(`✅ Updated channel group: ${name} (ID: ${id})`);
        console.log(`   - Bouquets: ${bouquet_ids.length}`);
        console.log(`   - IPTV Editor Channels: ${iptv_editor_channels.length}`);
        console.log(`   - IPTV Editor Movies: ${iptv_editor_movies.length}`);
        console.log(`   - IPTV Editor Series: ${iptv_editor_series.length}`);
        
        res.json({
            success: true,
            message: 'Channel group updated successfully',
            data: {
                id: parseInt(id),
                name: name.trim(),
                description,
                bouquet_ids,
                iptv_editor_channels,
                iptv_editor_movies,
                iptv_editor_series
            }
        });
        
    } catch (error) {
        console.error('❌ Error updating channel group:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update channel group: ' + error.message
        });
    }
});

// Get single channel group by ID
router.get('/channel-groups/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`🔍 Getting channel group by ID: ${id}`);
        
        const rows = await db.query(`
            SELECT id, name, description, bouquet_ids, 
                   iptv_editor_channels, iptv_editor_movies, iptv_editor_series,
                   is_active, created_at, updated_at
            FROM iptv_channel_groups 
            WHERE id = ? AND is_active = true
        `, [id]);
        
        if (rows.length === 0) {
            console.log(`❌ Channel group ${id} not found`);
            return res.status(404).json({
                success: false,
                message: 'Channel group not found'
            });
        }
        
        const rawGroup = rows[0];
        console.log(`📋 Raw group data:`, {
            id: rawGroup.id,
            name: rawGroup.name,
            bouquet_ids: rawGroup.bouquet_ids,
            iptv_editor_channels: rawGroup.iptv_editor_channels,
            iptv_editor_movies: rawGroup.iptv_editor_movies,
            iptv_editor_series: rawGroup.iptv_editor_series
        });
        
        // Parse JSON fields SAFELY - THIS IS THE FIX
        const group = {
            ...rawGroup,
            bouquet_ids: safeJsonParse(rawGroup.bouquet_ids, []),
            iptv_editor_channels: safeJsonParse(rawGroup.iptv_editor_channels, []),
            iptv_editor_movies: safeJsonParse(rawGroup.iptv_editor_movies, []),
            iptv_editor_series: safeJsonParse(rawGroup.iptv_editor_series, [])
        };
        
        console.log(`✅ Successfully parsed group data:`, {
            id: group.id,
            name: group.name,
            bouquet_count: group.bouquet_ids.length,
            editor_channels: group.iptv_editor_channels.length,
            editor_movies: group.iptv_editor_movies.length,
            editor_series: group.iptv_editor_series.length
        });
        
        res.json({
            success: true,
            data: group,
            message: 'Channel group retrieved successfully'
        });
        
    } catch (error) {
        console.error('❌ Error getting channel group:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get channel group: ' + error.message
        });
    }
});

// Delete channel group
router.delete('/channel-groups/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Soft delete - set is_active to false
        const result = await db.query(`
            UPDATE iptv_channel_groups 
            SET is_active = false, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ? AND is_active = true
        `, [id]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Channel group not found'
            });
        }
        
        console.log(`✅ Deleted channel group ID: ${id}`);
        
        res.json({
            success: true,
            message: 'Channel group deleted successfully'
        });
        
    } catch (error) {
        console.error('❌ Error deleting channel group:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete channel group: ' + error.message
        });
    }
});

module.exports = router;