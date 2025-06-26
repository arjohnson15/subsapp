// users-routes.js - Fixed version with proper tag handling
const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('./database-config');
const router = express.Router();

// Helper function to safely parse JSON fields
function safeJsonParse(jsonString, defaultValue = null) {
  if (!jsonString) return defaultValue;
  if (typeof jsonString === 'object') return jsonString; // Already parsed
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('JSON parse error:', error, 'for string:', jsonString);
    return defaultValue;
  }
}

// FIXED: Smart tag processing that handles both string and object inputs
function processTagsForUpdate(plexLibraries, existingTags = []) {
  console.log('Processing tags for update:', plexLibraries);
  console.log('Existing tags:', existingTags);
  
  // FIXED: Normalize existing tags to string array
  let normalizedExistingTags = [];
  if (Array.isArray(existingTags)) {
    normalizedExistingTags = existingTags.map(tag => {
      if (typeof tag === 'string') return tag;
      if (typeof tag === 'object' && tag.value) return tag.value;
      if (typeof tag === 'object' && tag.name) return tag.name;
      return String(tag);
    });
  }
  
  // Start with non-Plex tags (preserve IPTV, etc.)
  const nonPlexTags = normalizedExistingTags.filter(tag => 
    !String(tag).toLowerCase().includes('plex')
  );
  
  const updatedTags = [...nonPlexTags];
  
  // Add Plex tags based on library access
  if (plexLibraries && typeof plexLibraries === 'object') {
    Object.keys(plexLibraries).forEach(serverGroup => {
      const libraries = plexLibraries[serverGroup];
      
      // Check if user has ANY library access for this server group
      const hasRegularAccess = libraries && libraries.regular && libraries.regular.length > 0;
      const hasFourkAccess = libraries && libraries.fourk && libraries.fourk.length > 0;
      const hasAnyAccess = hasRegularAccess || hasFourkAccess;
      
      if (hasAnyAccess) {
        if (serverGroup === 'plex1' && !updatedTags.includes('Plex 1')) {
          updatedTags.push('Plex 1');
        } else if (serverGroup === 'plex2' && !updatedTags.includes('Plex 2')) {
          updatedTags.push('Plex 2');
        }
      }
      // Note: We do NOT remove tags here - only add them if access exists
    });
  }
  
  console.log('Processed tags for update:', updatedTags);
  return updatedTags;
}

// Get all users with their subscriptions
router.get('/', async (req, res) => {
  try {
    const users = await db.query(`
      SELECT 
        u.*,
        o.name as owner_name,
        GROUP_CONCAT(
          DISTINCT CONCAT(
            st.type, ':', 
            CASE 
              WHEN s.is_free = 1 THEN 'FREE'
              WHEN s.expiration_date IS NULL THEN 'NEVER'
              ELSE s.expiration_date
            END
          ) SEPARATOR '|'
        ) as subscriptions
      FROM users u
      LEFT JOIN owners o ON u.owner_id = o.id
      LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status = 'active'
      LEFT JOIN subscription_types st ON s.subscription_type_id = st.id
      GROUP BY u.id
      ORDER BY u.name
    `);

    // Process subscriptions data with safe JSON parsing
    const processedUsers = users.map(user => {
      const tags = safeJsonParse(user.tags, []);
      const plexLibraries = safeJsonParse(user.plex_libraries, {});
      
      const subscriptions = {};
      if (user.subscriptions) {
        user.subscriptions.split('|').forEach(sub => {
          const [type, expiration] = sub.split(':');
          subscriptions[type] = expiration;
        });
      }
      
      return {
        ...user,
        tags: tags,
        plex_libraries: plexLibraries,
        plex_expiration: subscriptions.plex || 'N/A',
        iptv_expiration: subscriptions.iptv || 'N/A'
      };
    });

    res.json(processedUsers);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get single user by ID
router.get('/:id', async (req, res) => {
  try {
    const [user] = await db.query(`
      SELECT 
        u.*,
        o.name as owner_name,
        o.email as owner_email
      FROM users u
      LEFT JOIN owners o ON u.owner_id = o.id
      WHERE u.id = ?
    `, [req.params.id]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user's subscriptions
    const subscriptions = await db.query(`
      SELECT s.*, st.name as subscription_name, st.type, st.price
      FROM subscriptions s
      JOIN subscription_types st ON s.subscription_type_id = st.id
      WHERE s.user_id = ? AND s.status = 'active'
    `, [req.params.id]);

    // Safe JSON parsing
    user.tags = safeJsonParse(user.tags, []);
    user.plex_libraries = safeJsonParse(user.plex_libraries, {});
    user.subscriptions = subscriptions;

    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Create new user
router.post('/', [
  body('name').notEmpty().trim().escape(),
  body('email').isEmail().normalizeEmail(),
  body('owner_id').optional().isInt(),
  body('tags').optional().isArray(),
  body('plex_email').optional().isEmail()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      name, email, owner_id, plex_email,
      iptv_username, iptv_password, implayer_code, device_count,
      bcc_owner_renewal, tags, plex_libraries
    } = req.body;

    // Check if email already exists
    const [existingUser] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // FIXED: Process tags based on actual library access
    const processedTags = plex_libraries ? 
      processTagsForUpdate(plex_libraries, tags || []) : 
      (tags || []);

    const result = await db.query(`
      INSERT INTO users (
        name, email, owner_id, plex_email,
        iptv_username, iptv_password, implayer_code, device_count,
        bcc_owner_renewal, tags, plex_libraries
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      name, email, owner_id || null, plex_email,
      iptv_username, iptv_password, implayer_code, device_count || 1,
      bcc_owner_renewal || false, 
      JSON.stringify(processedTags), 
      JSON.stringify(plex_libraries || {})
    ]);

    res.status(201).json({ 
      message: 'User created successfully', 
      userId: result.insertId 
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// FIXED: Update user with smart tag processing
router.put('/:id', [
  body('name').notEmpty().trim().escape(),
  body('email').isEmail().normalizeEmail(),
  body('owner_id').optional().isInt(),
  body('tags').optional().isArray(),
  body('plex_email').optional().isEmail()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      name, email, owner_id, plex_email,
      iptv_username, iptv_password, implayer_code, device_count,
      bcc_owner_renewal, tags, plex_libraries
    } = req.body;

    // Check if email exists for different user
    const [existingUser] = await db.query('SELECT id FROM users WHERE email = ? AND id != ?', [email, req.params.id]);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // FIXED: Get current user data to preserve existing tags properly
    const [currentUser] = await db.query('SELECT tags, plex_libraries FROM users WHERE id = ?', [req.params.id]);
    const currentTags = safeJsonParse(currentUser?.tags, []);
    const currentPlexLibraries = safeJsonParse(currentUser?.plex_libraries, {});

    console.log('Current user tags:', currentTags);
    console.log('Current plex libraries:', currentPlexLibraries);
    console.log('New plex libraries:', plex_libraries);

    // FIXED: Process tags based on the new library access
    const processedTags = plex_libraries ? 
      processTagsForUpdate(plex_libraries, currentTags) : 
      (tags || currentTags);

    console.log('Final processed tags:', processedTags);

    await db.query(`
      UPDATE users SET 
        name = ?, email = ?, owner_id = ?, plex_email = ?,
        iptv_username = ?, iptv_password = ?, implayer_code = ?, device_count = ?,
        bcc_owner_renewal = ?, tags = ?, plex_libraries = ?
      WHERE id = ?
    `, [
      name, email, owner_id || null, plex_email,
      iptv_username, iptv_password, implayer_code, device_count || 1,
      bcc_owner_renewal || false, 
      JSON.stringify(processedTags), 
      JSON.stringify(plex_libraries || {}),
      req.params.id
    ]);

    res.json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// NEW: Remove user's Plex access completely
router.post('/:id/remove-plex-access', async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Get user data
    const [user] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userEmail = user.plex_email || user.email;
    if (!userEmail) {
      return res.status(400).json({ error: 'User has no email configured for Plex removal' });
    }
    
    console.log(`🗑️ Removing all Plex access for user: ${user.name} (${userEmail})`);
    
    // Remove from all Plex server groups
    const removalResults = [];
    
    try {
      // Remove from plex1
      const plex1Result = await fetch('/api/plex/remove-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userEmail: userEmail,
          serverGroups: ['plex1', 'plex2']
        })
      });
      
      if (plex1Result.ok) {
        const result = await plex1Result.json();
        removalResults.push(result);
      }
    } catch (error) {
      console.error('Error removing from Plex servers:', error);
    }
    
    // Update database - remove Plex tags and clear library access
    const currentTags = safeJsonParse(user.tags, []);
    const nonPlexTags = currentTags.filter(tag => 
      !String(tag).toLowerCase().includes('plex')
    );
    
    await db.query(`
      UPDATE users 
      SET tags = ?, plex_libraries = ?, plex_email = NULL
      WHERE id = ?
    `, [
      JSON.stringify(nonPlexTags),
      JSON.stringify({}),
      userId
    ]);
    
    console.log(`✅ Removed Plex access for ${user.name}`);
    
    res.json({
      success: true,
      message: `All Plex access removed for ${user.name}`,
      removedTags: currentTags.filter(tag => String(tag).toLowerCase().includes('plex')),
      remainingTags: nonPlexTags,
      plexResults: removalResults
    });
    
  } catch (error) {
    console.error('Error removing Plex access:', error);
    res.status(500).json({ error: 'Failed to remove Plex access' });
  }
});

// Delete user
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Add/Update user subscription
router.post('/:id/subscription', [
  body('subscription_type_id').isInt(),
  body('expiration_date').optional().isISO8601(),
  body('is_free').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { subscription_type_id, expiration_date, is_free } = req.body;
    const userId = req.params.id;

    // Get subscription type info
    const [subType] = await db.query('SELECT * FROM subscription_types WHERE id = ?', [subscription_type_id]);
    if (!subType) {
      return res.status(404).json({ error: 'Subscription type not found' });
    }

    // Start transaction
    await db.transaction([
      // Remove existing subscription of same type
      {
        sql: 'UPDATE subscriptions SET status = "cancelled" WHERE user_id = ? AND subscription_type_id IN (SELECT id FROM subscription_types WHERE type = ?)',
        params: [userId, subType.type]
      },
      // Add new subscription
      {
        sql: `INSERT INTO subscriptions (user_id, subscription_type_id, start_date, expiration_date, is_free, status) 
              VALUES (?, ?, CURDATE(), ?, ?, 'active')`,
        params: [userId, subscription_type_id, expiration_date || null, is_free || false]
      }
    ]);

    res.json({ message: 'Subscription updated successfully' });
  } catch (error) {
    console.error('Error updating subscription:', error);
    res.status(500).json({ error: 'Failed to update subscription' });
  }
});

// Get users expiring soon
router.get('/expiring/:days', async (req, res) => {
  try {
    const days = parseInt(req.params.days) || 7;
    
    const users = await db.query(`
      SELECT 
        u.*, 
        s.expiration_date,
        st.name as subscription_name,
        st.type as subscription_type,
        o.name as owner_name,
        o.email as owner_email
      FROM users u
      JOIN subscriptions s ON u.id = s.user_id
      JOIN subscription_types st ON s.subscription_type_id = st.id
      LEFT JOIN owners o ON u.owner_id = o.id
      WHERE s.status = 'active' 
        AND s.is_free = FALSE
        AND s.expiration_date IS NOT NULL
        AND s.expiration_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
        AND s.expiration_date >= CURDATE()
      ORDER BY s.expiration_date ASC
    `, [days]);

    res.json(users);
  } catch (error) {
    console.error('Error fetching expiring users:', error);
    res.status(500).json({ error: 'Failed to fetch expiring users' });
  }
});

module.exports = router;