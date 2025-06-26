const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('./database-config');
const router = express.Router();

// Helper function to safely parse JSON - handles both JSON and legacy string data
function safeJsonParse(value, defaultValue = null) {
  if (!value) return defaultValue;
  if (typeof value === 'object') return value; // Already parsed
  if (typeof value !== 'string') return defaultValue;
  
  try {
    // Try parsing as JSON first
    return JSON.parse(value);
  } catch (error) {
    // Handle legacy string data that's not JSON
    if (value.includes(',')) {
      // Looks like comma-separated tags: "Plex 1, Plex 2, IPTV"
      return value.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
    } else if (value.length > 0) {
      // Single string value
      return [value.trim()];
    }
    
    console.warn('Could not parse value:', value, 'using default:', defaultValue);
    return defaultValue;
  }
}

// Helper function to process tags based on Plex library access
function processTagsForUpdate(plexLibraries, existingTags = []) {
  if (!plexLibraries || typeof plexLibraries !== 'object') {
    return existingTags;
  }

  const newTags = [...existingTags];
  const plexTags = ['Plex 1', 'Plex 2'];
  
  // Remove existing Plex tags
  plexTags.forEach(tag => {
    const index = newTags.indexOf(tag);
    if (index > -1) {
      newTags.splice(index, 1);
    }
  });
  
  // Add tags based on library access
  Object.keys(plexLibraries).forEach(serverGroup => {
    const libraries = plexLibraries[serverGroup];
    if (libraries && Object.keys(libraries).length > 0) {
      // Check if any library is selected
      const hasAccess = Object.values(libraries).some(lib => 
        lib && (lib.regular === true || lib.fourk === true)
      );
      
      if (hasAccess) {
        if (serverGroup === 'plex1' && !newTags.includes('Plex 1')) {
          newTags.push('Plex 1');
        } else if (serverGroup === 'plex2' && !newTags.includes('Plex 2')) {
          newTags.push('Plex 2');
        }
      }
    }
  });
  
  return newTags;
}

// Get all users with subscription data
router.get('/', async (req, res) => {
  try {
    const users = await db.query(`
      SELECT u.*, 
        o.name as owner_name,
        o.email as owner_email,
        MAX(CASE 
          WHEN st.type = 'plex' AND s.status = 'active' 
          THEN CASE 
            WHEN s.is_free = TRUE THEN 'FREE'
            ELSE s.expiration_date 
          END
          ELSE NULL 
        END) as plex_expiration,
        MAX(CASE 
          WHEN st.type = 'iptv' AND s.status = 'active' 
          THEN CASE 
            WHEN s.is_free = TRUE THEN 'FREE'
            ELSE s.expiration_date 
          END
          ELSE NULL 
        END) as iptv_expiration
      FROM users u
      LEFT JOIN owners o ON u.owner_id = o.id
      LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status = 'active'
      LEFT JOIN subscription_types st ON s.subscription_type_id = st.id
      GROUP BY u.id, o.name, o.email
      ORDER BY u.name
    `);

    // Safe JSON parsing and date formatting
    users.forEach(user => {
      user.tags = safeJsonParse(user.tags, []);
      user.plex_libraries = safeJsonParse(user.plex_libraries, {});
      
      // Handle expiration dates - show FREE for free subscriptions, blank for no subscription
      user.plex_expiration = user.plex_expiration === 'FREE' ? 'FREE' : (user.plex_expiration || '');
      user.iptv_expiration = user.iptv_expiration === 'FREE' ? 'FREE' : (user.iptv_expiration || '');
    });

    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get single user
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

    // Start transaction
    await db.query('START TRANSACTION');

    try {
      // Insert user
      const userResult = await db.query(`
        INSERT INTO users (
          name, email, owner_id, plex_email, iptv_username, iptv_password, 
          implayer_code, device_count, bcc_owner_renewal, tags, plex_libraries
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        name, email, owner_id, plex_email, iptv_username, iptv_password, 
        implayer_code, device_count || 1, bcc_owner_renewal || false, 
        JSON.stringify(tags || []), JSON.stringify(plex_libraries || {})
      ]);

      const userId = userResult.insertId;

      // Handle Plex subscription
      if (plex_subscription === 'free') {
        // Create FREE Plex subscription - use a dummy subscription type ID for free users
        await db.query(`
          INSERT INTO subscriptions (user_id, subscription_type_id, start_date, expiration_date, is_free, status)
          VALUES (?, 1, CURDATE(), NULL, TRUE, 'active')
        `, [userId]);
        console.log('✅ Created FREE Plex subscription for user:', userId);
      } else if (plex_subscription && plex_subscription !== '' && plex_expiration) {
        // Create paid Plex subscription
        await db.query(`
          INSERT INTO subscriptions (user_id, subscription_type_id, start_date, expiration_date, is_free, status)
          VALUES (?, ?, CURDATE(), ?, FALSE, 'active')
        `, [userId, parseInt(plex_subscription), plex_expiration]);
        console.log('✅ Created paid Plex subscription for user:', userId, 'type:', plex_subscription);
      }

      // Handle IPTV subscription
      if (iptv_subscription && iptv_subscription !== '' && iptv_expiration) {
        await db.query(`
          INSERT INTO subscriptions (user_id, subscription_type_id, start_date, expiration_date, is_free, status)
          VALUES (?, ?, CURDATE(), ?, FALSE, 'active')
        `, [userId, parseInt(iptv_subscription), iptv_expiration]);
        console.log('✅ Created IPTV subscription for user:', userId, 'type:', iptv_subscription);
      }

      // Commit transaction
      await db.query('COMMIT');
      
      res.status(201).json({ 
        message: 'User created successfully', 
        id: userId 
      });

    } catch (error) {
      // Rollback transaction on error
      await db.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error creating user:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user - FIXED subscription handling
router.put('/:id', [
  body('name').notEmpty().trim().escape(),
  body('email').isEmail().normalizeEmail(),
  body('owner_id').optional({ nullable: true, checkFalsy: true }).isInt(),
  body('tags').optional().isArray(),
  body('plex_email').optional().isEmail()
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

    // Start transaction
    await db.query('START TRANSACTION');

    try {
      // Get current user data
      const [currentUser] = await db.query('SELECT tags, plex_libraries FROM users WHERE id = ?', [req.params.id]);
      const currentTags = safeJsonParse(currentUser?.tags, []);
      const currentPlexLibraries = safeJsonParse(currentUser?.plex_libraries, {});

      console.log('Current user tags:', currentTags);
      console.log('Current plex libraries:', currentPlexLibraries);
      console.log('New plex libraries:', plex_libraries);
      console.log('Skip tag processing:', _skipTagProcessing);

      // FIXED: Respect tag preservation when frontend requests it
      let processedTags;
      if (_skipTagProcessing) {
          // Use tags exactly as provided by frontend
          processedTags = tags || currentTags;
          console.log('Using frontend-provided tags without processing:', processedTags);
      } else {
          // Process tags based on Plex library access (for new users or when explicitly updating Plex)
          processedTags = plex_libraries ? 
            processTagsForUpdate(plex_libraries, currentTags) : 
            (tags || currentTags);
          console.log('Processed tags based on Plex access:', processedTags);
      }

      // Clean up owner_id - convert null, undefined, or empty string to null
      const cleanOwnerId = (owner_id === null || owner_id === undefined || owner_id === '') ? null : owner_id;

      // Update user
      await db.query(`
        UPDATE users SET 
          name = ?, email = ?, owner_id = ?, plex_email = ?,
          iptv_username = ?, iptv_password = ?, implayer_code = ?, device_count = ?,
          bcc_owner_renewal = ?, tags = ?, plex_libraries = ?
        WHERE id = ?
      `, [
        name, 
        email, 
        cleanOwnerId, 
        plex_email || null,
        iptv_username || '', 
        iptv_password || '', 
        implayer_code || '', 
        device_count || 1,
        bcc_owner_renewal || false, 
        JSON.stringify(processedTags), 
        JSON.stringify(plex_libraries || {}),
        req.params.id
      ]);

      const userId = req.params.id;

      // Handle Plex subscription updates
      if (plex_subscription === 'free') {
        // Set to FREE - first deactivate existing Plex subscriptions
        await db.query(`
          UPDATE subscriptions s 
          JOIN subscription_types st ON s.subscription_type_id = st.id 
          SET s.status = 'cancelled' 
          WHERE s.user_id = ? AND st.type = 'plex' AND s.status = 'active'
        `, [userId]);

        // Create new FREE subscription
        await db.query(`
          INSERT INTO subscriptions (user_id, subscription_type_id, start_date, expiration_date, is_free, status)
          VALUES (?, 1, CURDATE(), NULL, TRUE, 'active')
        `, [userId]);
        console.log('✅ Updated to FREE Plex subscription for user:', userId);

      } else if (plex_subscription && plex_subscription !== '' && plex_expiration) {
        // Set to paid subscription - first deactivate existing Plex subscriptions
        await db.query(`
          UPDATE subscriptions s 
          JOIN subscription_types st ON s.subscription_type_id = st.id 
          SET s.status = 'cancelled' 
          WHERE s.user_id = ? AND st.type = 'plex' AND s.status = 'active'
        `, [userId]);

        // Create new paid subscription
        await db.query(`
          INSERT INTO subscriptions (user_id, subscription_type_id, start_date, expiration_date, is_free, status)
          VALUES (?, ?, CURDATE(), ?, FALSE, 'active')
        `, [userId, parseInt(plex_subscription), plex_expiration]);
        console.log('✅ Updated to paid Plex subscription for user:', userId, 'type:', plex_subscription);

      } else if (plex_subscription === '' || plex_subscription === null || plex_subscription === undefined) {
        // Remove Plex subscription - deactivate all Plex subscriptions
        await db.query(`
          UPDATE subscriptions s 
          JOIN subscription_types st ON s.subscription_type_id = st.id 
          SET s.status = 'cancelled' 
          WHERE s.user_id = ? AND st.type = 'plex' AND s.status = 'active'
        `, [userId]);
        console.log('✅ Removed Plex subscription for user:', userId);
      }

      // Handle IPTV subscription updates
      if (iptv_subscription && iptv_subscription !== '' && iptv_expiration) {
        // Set to paid IPTV subscription - first deactivate existing
        await db.query(`
          UPDATE subscriptions s 
          JOIN subscription_types st ON s.subscription_type_id = st.id 
          SET s.status = 'cancelled' 
          WHERE s.user_id = ? AND st.type = 'iptv' AND s.status = 'active'
        `, [userId]);

        // Create new IPTV subscription
        await db.query(`
          INSERT INTO subscriptions (user_id, subscription_type_id, start_date, expiration_date, is_free, status)
          VALUES (?, ?, CURDATE(), ?, FALSE, 'active')
        `, [userId, parseInt(iptv_subscription), iptv_expiration]);
        console.log('✅ Updated IPTV subscription for user:', userId, 'type:', iptv_subscription);

      } else if (iptv_subscription === '' || iptv_subscription === null || iptv_subscription === undefined) {
        // Remove IPTV subscription
        await db.query(`
          UPDATE subscriptions s 
          JOIN subscription_types st ON s.subscription_type_id = st.id 
          SET s.status = 'cancelled' 
          WHERE s.user_id = ? AND st.type = 'iptv' AND s.status = 'active'
        `, [userId]);
        console.log('✅ Removed IPTV subscription for user:', userId);
      }

      // Commit transaction
      await db.query('COMMIT');
      
      res.json({ message: 'User updated successfully' });

    } catch (error) {
      // Rollback transaction on error
      await db.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error updating user:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Remove user's Plex access completely
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
    
    res.json({ 
      message: 'Plex access removed successfully',
      removalResults: removalResults,
      removedTags: currentTags.filter(tag => String(tag).toLowerCase().includes('plex'))
    });
    
  } catch (error) {
    console.error('Error removing Plex access:', error);
    res.status(500).json({ error: 'Failed to remove Plex access' });
  }
});

// Delete user
router.delete('/:id', async (req, res) => {
  try {
    // Get user data before deletion for Plex cleanup
    const [user] = await db.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
    
    if (user) {
      const userEmail = user.plex_email || user.email;
      const plexLibraries = safeJsonParse(user.plex_libraries, {});
      
      // Remove from Plex if user has access
      if (userEmail && Object.keys(plexLibraries).length > 0) {
        console.log(`🗑️ Removing Plex access for deleted user: ${user.name} (${userEmail})`);
        
        try {
          await fetch('/api/plex/remove-access', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userEmail: userEmail,
              serverGroups: ['plex1', 'plex2']
            })
          });
        } catch (error) {
          console.error('Error removing Plex access during user deletion:', error);
        }
      }
    }
    
    // Delete user from database
    await db.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Get users with expiring subscriptions
router.get('/expiring/:days', async (req, res) => {
  try {
    const days = parseInt(req.params.days) || 7;
    
    const users = await db.query(`
      SELECT u.*, 
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