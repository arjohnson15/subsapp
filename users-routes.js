const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('./database-config');
const plexService = require('./plex-service');
const router = express.Router();

// Safe JSON parsing function
function safeJsonParse(str, defaultValue = null) {
  try {
    if (str === null || str === undefined || str === '') {
      return defaultValue;
    }
    if (typeof str === 'object') {
      return str; // Already parsed
    }
    return JSON.parse(str);
  } catch (error) {
    console.error('JSON parse error:', error, 'for value:', str);
    return defaultValue;
  }
}

// Helper function to process tags for new users based on Plex library access
function processTagsForUpdate(plexLibraries, currentTags = []) {
  const newTags = [];
  
  // Extract tags from plex_libraries
  if (plexLibraries && typeof plexLibraries === 'object') {
    Object.keys(plexLibraries).forEach(serverGroup => {
      const libraries = plexLibraries[serverGroup];
      if (libraries && (libraries.regular?.length > 0 || libraries.fourk?.length > 0)) {
        if (serverGroup === 'plex1') {
          if (!newTags.includes('Plex 1')) newTags.push('Plex 1');
        } else if (serverGroup === 'plex2') {
          if (!newTags.includes('Plex 2')) newTags.push('Plex 2');
        }
      }
    });
  }
  
  // Preserve any non-Plex tags from current tags
  const preservedTags = currentTags.filter(tag => 
    !['Plex 1', 'Plex 2'].includes(tag)
  );
  
  return [...newTags, ...preservedTags];
}

// Get all users with their subscriptions
router.get('/', async (req, res) => {
  try {
    const users = await db.query(`
      SELECT u.*, 
        o.name as owner_name,
        o.email as owner_email
      FROM users u
      LEFT JOIN owners o ON u.owner_id = o.id
      ORDER BY u.name
    `);

    // Process each user to include subscription information
    const processedUsers = await Promise.all(users.map(async (user) => {
      // Get user's subscriptions
      const subscriptions = await db.query(`
        SELECT s.*, st.name as subscription_name, st.type, st.price
        FROM subscriptions s
        JOIN subscription_types st ON s.subscription_type_id = st.id
        WHERE s.user_id = ? AND s.status = 'active'
      `, [user.id]);

      // Safe JSON parsing
      user.tags = safeJsonParse(user.tags, []);
      user.plex_libraries = safeJsonParse(user.plex_libraries, {});
      user.subscriptions = subscriptions;

      // Add subscription expiration dates to user object for frontend compatibility
      user.plex_expiration = null;
      user.iptv_expiration = null;

      subscriptions.forEach(sub => {
        if (sub.type === 'plex') {
          if (sub.is_free) {
            user.plex_expiration = 'FREE';
          } else {
            // Format date to YYYY-MM-DD only (remove time)
            user.plex_expiration = sub.expiration_date ? 
              new Date(sub.expiration_date).toISOString().split('T')[0] : 
              null;
          }
        } else if (sub.type === 'iptv') {
          if (sub.is_free) {
            user.iptv_expiration = 'FREE';
          } else {
            // Format date to YYYY-MM-DD only (remove time)
            user.iptv_expiration = sub.expiration_date ? 
              new Date(sub.expiration_date).toISOString().split('T')[0] : 
              null;
          }
        }
      });

      // If no subscriptions found, set default values
      if (user.plex_expiration === null) {
        user.plex_expiration = 'No Subscription';
      }
      if (user.iptv_expiration === null) {
        user.iptv_expiration = 'No Subscription';
      }

      return user;
    }));

    res.json(processedUsers);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get specific user by ID
router.get('/:id', async (req, res) => {
  try {
    const [user] = await db.query(`
      SELECT u.*, 
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

    // Add subscription expiration dates to user object for frontend compatibility
    user.plex_expiration = null;
    user.iptv_expiration = null;

    subscriptions.forEach(sub => {
      if (sub.type === 'plex') {
        if (sub.is_free) {
          user.plex_expiration = 'FREE';
        } else {
          // Format date to YYYY-MM-DD only (remove time)
          user.plex_expiration = sub.expiration_date ? 
            new Date(sub.expiration_date).toISOString().split('T')[0] : 
            null;
        }
      } else if (sub.type === 'iptv') {
        if (sub.is_free) {
          user.iptv_expiration = 'FREE';
        } else {
          // Format date to YYYY-MM-DD only (remove time)
          user.iptv_expiration = sub.expiration_date ? 
            new Date(sub.expiration_date).toISOString().split('T')[0] : 
            null;
        }
      }
    });

    // If no subscriptions found, set default values
    if (user.plex_expiration === null) {
      user.plex_expiration = 'No Subscription';
    }
    if (user.iptv_expiration === null) {
      user.iptv_expiration = 'No Subscription';
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Create new user - FIXED subscription handling
router.post('/', [
  body('name').notEmpty().trim(),
  body('email').isEmail()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { 
      name, email, owner_id, plex_email, iptv_username, iptv_password, 
      implayer_code, device_count, bcc_owner_renewal, tags, plex_libraries,
      plex_subscription, plex_expiration, plex_is_free,
      iptv_subscription, iptv_expiration, iptv_is_free
    } = req.body;

    console.log('🔄 Creating user with subscription data:', {
      name, email, plex_subscription, plex_expiration, plex_is_free,
      iptv_subscription, iptv_expiration, iptv_is_free
    });

    // Prepare transaction queries
    const transactionQueries = [];

    // Insert user query
    transactionQueries.push({
      sql: `
        INSERT INTO users (
          name, email, owner_id, plex_email, iptv_username, iptv_password, 
          implayer_code, device_count, bcc_owner_renewal, tags, plex_libraries
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      params: [
        name, email, owner_id || null, plex_email || null,
        iptv_username || null, iptv_password || null, implayer_code || null,
        device_count || 1, bcc_owner_renewal || false,
        JSON.stringify(tags || []), JSON.stringify(plex_libraries || {})
      ]
    });

    // Execute user creation first to get ID
    const result = await db.transaction(transactionQueries);
    const userId = result[0].insertId;

    console.log('✅ User created with ID:', userId);

    // Handle subscriptions after user creation
    try {
      // Handle Plex subscription
      if (plex_subscription && plex_subscription !== 'remove') {
        if (plex_subscription === 'free') {
          await db.query(`
            INSERT INTO subscriptions (user_id, subscription_type_id, start_date, expiration_date, is_free, status)
            VALUES (?, NULL, CURDATE(), NULL, TRUE, 'active')
          `, [userId]);
          console.log('✅ Created FREE Plex subscription for user:', userId);
        } else if (plex_expiration) {
          await db.query(`
            INSERT INTO subscriptions (user_id, subscription_type_id, start_date, expiration_date, is_free, status)
            VALUES (?, ?, CURDATE(), ?, FALSE, 'active')
          `, [userId, parseInt(plex_subscription), plex_expiration]);
          console.log('✅ Created paid Plex subscription for user:', userId, 'type:', plex_subscription);
        }
      }

      // Handle IPTV subscription
      if (iptv_subscription && iptv_subscription !== 'remove') {
        if (iptv_subscription === 'free') {
          await db.query(`
            INSERT INTO subscriptions (user_id, subscription_type_id, start_date, expiration_date, is_free, status)
            VALUES (?, NULL, CURDATE(), NULL, TRUE, 'active')
          `, [userId]);
          console.log('✅ Created FREE IPTV subscription for user:', userId);
        } else if (iptv_expiration) {
          await db.query(`
            INSERT INTO subscriptions (user_id, subscription_type_id, start_date, expiration_date, is_free, status)
            VALUES (?, ?, CURDATE(), ?, FALSE, 'active')
          `, [userId, parseInt(iptv_subscription), iptv_expiration]);
          console.log('✅ Created paid IPTV subscription for user:', userId, 'type:', iptv_subscription);
        }
      }

      res.status(201).json({ message: 'User created successfully', id: userId });

    } catch (subscriptionError) {
      console.error('Error creating subscriptions:', subscriptionError);
      res.status(201).json({ 
        message: 'User created successfully, but there was an issue creating subscriptions. Please edit the user to add subscriptions.', 
        id: userId,
        warning: 'Subscription creation failed'
      });
    }

  } catch (error) {
    console.error('Error creating user:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user - FIXED subscription validation and transaction handling
router.put('/:id', [
  body('name').notEmpty().trim().escape(),
  body('email').isEmail().normalizeEmail(),
  body('owner_id').optional({ nullable: true, checkFalsy: true }).isInt(),
  body('tags').optional().isArray(),
  body('plex_email').optional().isEmail(),
  // FIXED: Add validation for subscription fields to prevent 500 error
  body('plex_subscription').optional(),
  body('plex_expiration').optional().custom((value) => {
    if (value && value !== '') {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid date format for plex_expiration');
      }
    }
    return true;
  }),
  body('iptv_subscription').optional(),
  body('iptv_expiration').optional().custom((value) => {
    if (value && value !== '') {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid date format for iptv_expiration');
      }
    }
    return true;
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      name, email, owner_id, plex_email,
      iptv_username, iptv_password, implayer_code, device_count,
      bcc_owner_renewal, tags, plex_libraries, _skipTagProcessing,
      plex_subscription, plex_expiration, plex_is_free,
      iptv_subscription, iptv_expiration, iptv_is_free
    } = req.body;

    console.log('🔄 Updating user with subscription data:', {
      userId: req.params.id, plex_subscription, plex_expiration, plex_is_free,
      iptv_subscription, iptv_expiration, iptv_is_free
    });

    // Check if email exists for different user
    const [existingUser] = await db.query('SELECT id FROM users WHERE email = ? AND id != ?', [email, req.params.id]);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Get current user data
    const [currentUser] = await db.query('SELECT tags, plex_libraries FROM users WHERE id = ?', [req.params.id]);
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Process tags (only if not explicitly skipped)
    let finalTags = tags || [];
    if (!_skipTagProcessing && plex_libraries) {
      const currentTags = safeJsonParse(currentUser.tags, []);
      finalTags = processTagsForUpdate(plex_libraries, currentTags);
    }

    // Update user information
    await db.query(`
      UPDATE users SET 
        name = ?, email = ?, owner_id = ?, plex_email = ?, 
        iptv_username = ?, iptv_password = ?, implayer_code = ?, device_count = ?,
        bcc_owner_renewal = ?, tags = ?, plex_libraries = ?
      WHERE id = ?
    `, [
      name, email, owner_id || null, plex_email || null,
      iptv_username || null, iptv_password || null, implayer_code || null, device_count || 1,
      bcc_owner_renewal || false, JSON.stringify(finalTags), JSON.stringify(plex_libraries || {}),
      req.params.id
    ]);

    console.log('✅ Updated user basic info for ID:', req.params.id);

    // Handle subscription updates if provided
    try {
      const userId = req.params.id;

      // Handle Plex subscription updates - ONLY if explicitly provided
      if (plex_subscription !== undefined) {
        console.log('🔄 Processing Plex subscription update:', plex_subscription);
        
        if (plex_subscription === 'remove') {
          // Remove Plex subscription - deactivate ALL Plex subscriptions
          await db.query(`
            UPDATE subscriptions s 
            JOIN subscription_types st ON s.subscription_type_id = st.id 
            SET s.status = 'cancelled' 
            WHERE s.user_id = ? AND st.type = 'plex' AND s.status = 'active'
          `, [userId]);
          console.log('✅ Removed Plex subscription for user:', userId);

        } else if (plex_subscription === 'free') {
          // Set to FREE Plex - first deactivate ALL existing Plex subscriptions
          await db.query(`
            UPDATE subscriptions s 
            JOIN subscription_types st ON s.subscription_type_id = st.id 
            SET s.status = 'cancelled' 
            WHERE s.user_id = ? AND st.type = 'plex' AND s.status = 'active'
          `, [userId]);

          // Create new FREE subscription
          await db.query(`
            INSERT INTO subscriptions (user_id, subscription_type_id, start_date, expiration_date, is_free, status)
            VALUES (?, NULL, CURDATE(), NULL, TRUE, 'active')
          `, [userId]);
          console.log('✅ Updated to FREE Plex subscription for user:', userId);

        } else if (plex_subscription && plex_subscription !== '' && plex_expiration) {
          // Set to paid Plex subscription - first deactivate ALL existing Plex subscriptions
          await db.query(`
            UPDATE subscriptions s 
            JOIN subscription_types st ON s.subscription_type_id = st.id 
            SET s.status = 'cancelled' 
            WHERE s.user_id = ? AND st.type = 'plex' AND s.status = 'active'
          `, [userId]);

          // Double-check: ensure no active Plex subscriptions exist before inserting
          const [existingPlex] = await db.query(`
            SELECT COUNT(*) as count
            FROM subscriptions s 
            JOIN subscription_types st ON s.subscription_type_id = st.id 
            WHERE s.user_id = ? AND st.type = 'plex' AND s.status = 'active'
          `, [userId]);

          if (existingPlex.count > 0) {
            console.error(`⚠️ WARNING: User ${userId} still has ${existingPlex.count} active Plex subscriptions after cancellation!`);
            // Force cancel them again
            await db.query(`
              UPDATE subscriptions s 
              JOIN subscription_types st ON s.subscription_type_id = st.id 
              SET s.status = 'cancelled' 
              WHERE s.user_id = ? AND st.type = 'plex' AND s.status = 'active'
            `, [userId]);
          }

          // Create new paid subscription
          await db.query(`
            INSERT INTO subscriptions (user_id, subscription_type_id, start_date, expiration_date, is_free, status)
            VALUES (?, ?, CURDATE(), ?, FALSE, 'active')
          `, [userId, parseInt(plex_subscription), plex_expiration]);
          console.log('✅ Updated to paid Plex subscription for user:', userId, 'type:', plex_subscription);
        }
        // If plex_subscription is null, undefined, or empty string - do nothing (preserve existing)
      }

      // Handle IPTV subscription updates - ONLY if explicitly provided
      if (iptv_subscription !== undefined) {
        console.log('🔄 Processing IPTV subscription update:', iptv_subscription);
        
        if (iptv_subscription === 'remove') {
          // Remove IPTV subscription - deactivate ALL IPTV subscriptions
          await db.query(`
            UPDATE subscriptions s 
            JOIN subscription_types st ON s.subscription_type_id = st.id 
            SET s.status = 'cancelled' 
            WHERE s.user_id = ? AND st.type = 'iptv' AND s.status = 'active'
          `, [userId]);
          console.log('✅ Removed IPTV subscription for user:', userId);

        } else if (iptv_subscription === 'free') {
          // Set to FREE IPTV - first deactivate ALL existing IPTV subscriptions
          await db.query(`
            UPDATE subscriptions s 
            JOIN subscription_types st ON s.subscription_type_id = st.id 
            SET s.status = 'cancelled' 
            WHERE s.user_id = ? AND st.type = 'iptv' AND s.status = 'active'
          `, [userId]);

          // Create new FREE subscription
          await db.query(`
            INSERT INTO subscriptions (user_id, subscription_type_id, start_date, expiration_date, is_free, status)
            VALUES (?, NULL, CURDATE(), NULL, TRUE, 'active')
          `, [userId]);
          console.log('✅ Updated to FREE IPTV subscription for user:', userId);

        } else if (iptv_subscription && iptv_subscription !== '' && iptv_expiration) {
          // Set to paid IPTV subscription - first deactivate ALL existing IPTV subscriptions
          await db.query(`
            UPDATE subscriptions s 
            JOIN subscription_types st ON s.subscription_type_id = st.id 
            SET s.status = 'cancelled' 
            WHERE s.user_id = ? AND st.type = 'iptv' AND s.status = 'active'
          `, [userId]);

          // Double-check: ensure no active IPTV subscriptions exist before inserting
          const [existingIptv] = await db.query(`
            SELECT COUNT(*) as count
            FROM subscriptions s 
            JOIN subscription_types st ON s.subscription_type_id = st.id 
            WHERE s.user_id = ? AND st.type = 'iptv' AND s.status = 'active'
          `, [userId]);

          if (existingIptv.count > 0) {
            console.error(`⚠️ WARNING: User ${userId} still has ${existingIptv.count} active IPTV subscriptions after cancellation!`);
            // Force cancel them again
            await db.query(`
              UPDATE subscriptions s 
              JOIN subscription_types st ON s.subscription_type_id = st.id 
              SET s.status = 'cancelled' 
              WHERE s.user_id = ? AND st.type = 'iptv' AND s.status = 'active'
            `, [userId]);
          }

          // Create new IPTV subscription
          await db.query(`
            INSERT INTO subscriptions (user_id, subscription_type_id, start_date, expiration_date, is_free, status)
            VALUES (?, ?, CURDATE(), ?, FALSE, 'active')
          `, [userId, parseInt(iptv_subscription), iptv_expiration]);
          console.log('✅ Updated IPTV subscription for user:', userId, 'type:', iptv_subscription);
        }
        // If iptv_subscription is null, undefined, or empty string - do nothing (preserve existing)
      }

      res.json({ message: 'User updated successfully' });

    } catch (subscriptionError) {
      console.error('Error updating subscriptions:', subscriptionError);
      res.json({ 
        message: 'User updated successfully, but there was an issue with subscription updates. Please check subscription settings.',
        warning: 'Subscription update failed'
      });
    }

  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete user
router.delete('/:id', async (req, res) => {
  try {
    // Get user info before deletion
    const [user] = await db.query('SELECT name, email, plex_email, plex_libraries FROM users WHERE id = ?', [req.params.id]);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Parse Plex libraries to determine which users to unshare
    const plexLibraries = safeJsonParse(user.plex_libraries, {});
    
    try {
      // Unshare from Plex servers if they have access
      if (plexLibraries && Object.keys(plexLibraries).length > 0) {
        console.log(`🔄 Unsharing user ${user.name} (${user.plex_email}) from Plex servers...`);
        
        for (const serverGroup of Object.keys(plexLibraries)) {
          const access = plexLibraries[serverGroup];
          if (access && (access.regular?.length > 0 || access.fourk?.length > 0)) {
            try {
              await plexService.unshareUser(serverGroup, user.plex_email);
              console.log(`✅ Unshared from ${serverGroup}`);
            } catch (unshareError) {
              console.error(`❌ Failed to unshare from ${serverGroup}:`, unshareError.message);
              // Continue with deletion even if unsharing fails
            }
          }
        }
      }
    } catch (plexError) {
      console.error('Error during Plex unsharing:', plexError);
      // Continue with deletion even if Plex operations fail
    }

    // Delete user and related data using transaction
    const transactionQueries = [
      {
        sql: 'DELETE FROM subscriptions WHERE user_id = ?',
        params: [req.params.id]
      },
      {
        sql: 'DELETE FROM users WHERE id = ?',
        params: [req.params.id]
      }
    ];

    await db.transaction(transactionQueries);
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Get users expiring soon (used by dashboard) - FIXED: Added subscription_type field
router.get('/expiring/:days', async (req, res) => {
  try {
    const days = parseInt(req.params.days) || 7;
    const users = await db.query(`
      SELECT u.name, u.email, s.expiration_date, 
             st.name as subscription_name, 
             st.type as subscription_type
      FROM users u
      JOIN subscriptions s ON u.id = s.user_id
      JOIN subscription_types st ON s.subscription_type_id = st.id
      WHERE s.status = 'active' 
        AND s.is_free = FALSE
        AND s.expiration_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
        AND s.expiration_date >= CURDATE()
      ORDER BY s.expiration_date
    `, [days]);

    res.json(users);
  } catch (error) {
    console.error('Error fetching expiring users:', error);
    res.status(500).json({ error: 'Failed to fetch expiring users' });
  }
});

// Sync user with Plex (manual sync)
router.post('/:id/sync-plex', async (req, res) => {
  try {
    const [user] = await db.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Parse the user's Plex libraries
    const plexLibraries = safeJsonParse(user.plex_libraries, {});
    
    if (!plexLibraries || Object.keys(plexLibraries).length === 0) {
      return res.status(400).json({ error: 'User has no Plex library assignments' });
    }

    // Sync with each server group
    const results = [];
    for (const serverGroup of Object.keys(plexLibraries)) {
      const access = plexLibraries[serverGroup];
      if (access && (access.regular?.length > 0 || access.fourk?.length > 0)) {
        try {
          await plexService.shareLibrariesWithUser(serverGroup, user.plex_email, access.regular, access.fourk);
          results.push(`✅ Synced with ${serverGroup}`);
        } catch (error) {
          results.push(`❌ Failed to sync with ${serverGroup}: ${error.message}`);
        }
      }
    }

    res.json({ 
      message: 'Plex sync completed',
      results: results
    });
  } catch (error) {
    console.error('Error syncing user with Plex:', error);
    res.status(500).json({ error: 'Failed to sync user with Plex' });
  }
});

module.exports = router;