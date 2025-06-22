const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const router = express.Router();

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

    // Process subscriptions data
    const processedUsers = users.map(user => {
      const subscriptions = {};
      if (user.subscriptions) {
        user.subscriptions.split('|').forEach(sub => {
          const [type, expiration] = sub.split(':');
          subscriptions[type] = expiration;
        });
      }
      
      return {
        ...user,
        tags: user.tags ? JSON.parse(user.tags) : [],
        plex_libraries: user.plex_libraries ? JSON.parse(user.plex_libraries) : {},
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

    user.tags = user.tags ? JSON.parse(user.tags) : [];
    user.plex_libraries = user.plex_libraries ? JSON.parse(user.plex_libraries) : {};
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
  body('plex_username').optional().trim(),
  body('iptv_username').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      name, email, owner_id, plex_username, plex_password,
      iptv_username, iptv_password, implayer_code, device_count,
      bcc_owner_renewal, tags, plex_libraries
    } = req.body;

    // Check if email already exists
    const [existingUser] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const result = await db.query(`
      INSERT INTO users (
        name, email, owner_id, plex_username, plex_password,
        iptv_username, iptv_password, implayer_code, device_count,
        bcc_owner_renewal, tags, plex_libraries
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      name, email, owner_id || null, plex_username, plex_password,
      iptv_username, iptv_password, implayer_code, device_count || 1,
      bcc_owner_renewal || false, JSON.stringify(tags || []), JSON.stringify(plex_libraries || {})
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

// Update user
router.put('/:id', [
  body('name').notEmpty().trim().escape(),
  body('email').isEmail().normalizeEmail(),
  body('owner_id').optional().isInt(),
  body('tags').optional().isArray()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      name, email, owner_id, plex_username, plex_password,
      iptv_username, iptv_password, implayer_code, device_count,
      bcc_owner_renewal, tags, plex_libraries
    } = req.body;

    // Check if email exists for different user
    const [existingUser] = await db.query('SELECT id FROM users WHERE email = ? AND id != ?', [email, req.params.id]);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    await db.query(`
      UPDATE users SET 
        name = ?, email = ?, owner_id = ?, plex_username = ?, plex_password = ?,
        iptv_username = ?, iptv_password = ?, implayer_code = ?, device_count = ?,
        bcc_owner_renewal = ?, tags = ?, plex_libraries = ?
      WHERE id = ?
    `, [
      name, email, owner_id || null, plex_username, plex_password,
      iptv_username, iptv_password, implayer_code, device_count || 1,
      bcc_owner_renewal || false, JSON.stringify(tags || []), JSON.stringify(plex_libraries || {}),
      req.params.id
    ]);

    res.json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
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