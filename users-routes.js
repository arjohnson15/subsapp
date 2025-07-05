const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('./database-config');
const plexService = require('./plex-service');
const router = express.Router();

router.post('/:id/check-pending-invites', async (req, res) => {
  try {
    const userId = req.params.id;
    
    console.log(`🔍 Manual pending invite check for user ID: ${userId}`);
    
    // Get user data
    const [user] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userEmail = user.plex_email || user.email;
    
    if (!userEmail) {
      return res.status(400).json({ error: 'User has no email configured for Plex invite check' });
    }
    
    console.log(`📧 Checking pending invites for: ${userEmail}`);
    
    // Check for pending invites using the Plex service
    // Use the plexService already imported at the top
    const pendingInvites = await plexService.checkUserPendingInvites(userEmail);
    
    // Update database with current pending invites status
    await db.query(`
      UPDATE users 
      SET pending_plex_invites = ?, updated_at = NOW()
      WHERE id = ?
    `, [pendingInvites ? JSON.stringify(pendingInvites) : null, user.id]);
    
    if (pendingInvites) {
      const serverGroups = Object.keys(pendingInvites);
      console.log(`⏳ ${user.name} has pending invites for: ${serverGroups.join(', ')}`);
    } else {
      console.log(`✅ ${user.name} has no pending invites`);
    }
    
    res.json({ 
      success: true,
      user: user.name,
      email: userEmail,
      pendingInvites: pendingInvites,
      message: pendingInvites 
        ? `User has pending invites for: ${Object.keys(pendingInvites).join(', ')}`
        : 'User has no pending invites'
    });
    
  } catch (error) {
    console.error('Error checking pending invites:', error);
    res.status(500).json({ error: 'Failed to check pending invites' });
  }
});

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
// Get user's subscriptions (updated for new schema)
const subscriptions = await db.query(`
  SELECT s.*, 
         CASE 
           WHEN s.subscription_type_id IS NULL THEN 'FREE Plex Access'
           ELSE st.name 
         END as subscription_name,
         CASE 
           WHEN s.subscription_type_id IS NULL THEN 'plex'
           ELSE st.type 
         END as type,
         CASE 
           WHEN s.subscription_type_id IS NULL THEN 0.00
           ELSE st.price 
         END as price
  FROM subscriptions s
  LEFT JOIN subscription_types st ON s.subscription_type_id = st.id
  WHERE s.user_id = ? AND s.status = 'active'
  ORDER BY s.expiration_date DESC
`, [user.id]);

      // Parse JSON fields safely
      const tags = safeJsonParse(user.tags, []);
      const plexLibraries = safeJsonParse(user.plex_libraries, {});
      const pendingPlexInvites = safeJsonParse(user.pending_plex_invites, null); // ADD THIS LINE

// Calculate subscription expirations
// Calculate subscription expirations and names
let plexExpiration = null;
let iptvExpiration = null;
let plexSubscription = null;
let iptvSubscription = null;

for (const sub of subscriptions) {
  if (sub.type === 'plex') {
    plexSubscription = sub.subscription_name; // Add subscription name
    if (sub.subscription_type_id === null) {
      plexExpiration = 'FREE';
      break;
    } else if (!plexExpiration || new Date(sub.expiration_date) > new Date(plexExpiration)) {
      plexExpiration = sub.expiration_date ? 
        new Date(sub.expiration_date).toISOString().split('T')[0] : 
        null;
    }
  } else if (sub.type === 'iptv') {
    iptvSubscription = sub.subscription_name; // Add subscription name
    if (!iptvExpiration || new Date(sub.expiration_date) > new Date(iptvExpiration)) {
      iptvExpiration = sub.expiration_date ? 
        new Date(sub.expiration_date).toISOString().split('T')[0] : 
        null;
    }
  }
}

return {
  ...user,
  tags,
  plex_libraries: plexLibraries,
  pending_plex_invites: pendingPlexInvites,
  subscriptions,
  plex_subscription: plexSubscription,  // ADD THIS
  iptv_subscription: iptvSubscription,  // ADD THIS
  plex_expiration: plexExpiration,
  iptv_expiration: iptvExpiration
};
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

// Get user's subscriptions - FIXED to include FREE subscriptions
// Get user's subscriptions - ENHANCED to include subscription type names
const subscriptions = await db.query(`
  SELECT s.*, 
         CASE 
           WHEN s.subscription_type_id IS NULL THEN 'FREE Plex Access'
           ELSE st.name 
         END as subscription_name,
         CASE 
           WHEN s.subscription_type_id IS NULL THEN 'plex'
           ELSE st.type 
         END as type,
         CASE 
           WHEN s.subscription_type_id IS NULL THEN 0.00
           ELSE st.price 
         END as price
  FROM subscriptions s
  LEFT JOIN subscription_types st ON s.subscription_type_id = st.id
  WHERE s.user_id = ? AND s.status = 'active'
`, [req.params.id]);

    // Safe JSON parsing
    user.tags = safeJsonParse(user.tags, []);
    user.plex_libraries = safeJsonParse(user.plex_libraries, {});
	user.pending_plex_invites = safeJsonParse(user.pending_plex_invites, null);
    user.subscriptions = subscriptions;

    // Add subscription expiration dates to user object for frontend compatibility
    user.plex_expiration = null;
    user.iptv_expiration = null;

// Add subscription type names and expiration dates
user.plex_subscription = null;
user.iptv_subscription = null;

subscriptions.forEach(sub => {
  if (sub.type === 'plex') {
    user.plex_subscription = sub.subscription_name; // Add subscription name
    if (sub.subscription_type_id === null) {
      user.plex_expiration = 'FREE';
    } else {
      user.plex_expiration = sub.expiration_date ? 
        new Date(sub.expiration_date).toISOString().split('T')[0] : 
        null;
    }
  } else if (sub.type === 'iptv') {
    user.iptv_subscription = sub.subscription_name; // Add subscription name
    user.iptv_expiration = sub.expiration_date ? 
      new Date(sub.expiration_date).toISOString().split('T')[0] : 
      null;
  }
});

// Set default values if no subscriptions found
if (user.plex_subscription === null) {
  user.plex_subscription = null;
}
if (user.iptv_subscription === null) {
  user.iptv_subscription = null;
}

    // If no subscriptions found, leave as null (will display as empty in frontend)
    if (user.plex_expiration === null) {
      user.plex_expiration = null;
    }
    if (user.iptv_expiration === null) {
      user.iptv_expiration = null;
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
  implayer_code, device_count, bcc_owner_renewal, exclude_bulk_emails, exclude_automated_emails,
  tags, plex_libraries,
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
      implayer_code, device_count, bcc_owner_renewal, exclude_bulk_emails, exclude_automated_emails,
      tags, plex_libraries
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  params: [
    name, email, owner_id || null, plex_email || null,
    iptv_username || null, iptv_password || null, implayer_code || null,
    device_count || 1, bcc_owner_renewal || false, exclude_bulk_emails || false, exclude_automated_emails || false,
    JSON.stringify(tags || []), JSON.stringify(plex_libraries || {})
  ]
});

    // Execute user creation first to get ID
    const result = await db.transaction(transactionQueries);
    const userId = result[0].insertId;

    console.log('✅ User created with ID:', userId);

    // Handle subscriptions after user creation
    try {
// Handle Plex subscription (updated for new schema)
if (plex_subscription && plex_subscription !== 'remove') {
if (plex_subscription === 'free') {
  // Use NULL subscription_type_id for FREE Plex Access (as per schema)
  await db.query(`
    INSERT INTO subscriptions (user_id, subscription_type_id, start_date, expiration_date, status)
    VALUES (?, NULL, CURDATE(), NULL, 'active')
  `, [userId]);
    console.log('✅ Created FREE Plex subscription for user:', userId);
  } else if (plex_expiration) {
    await db.query(`
      INSERT INTO subscriptions (user_id, subscription_type_id, start_date, expiration_date, status)
      VALUES (?, ?, CURDATE(), ?, 'active')
    `, [userId, parseInt(plex_subscription), plex_expiration]);
    console.log('✅ Created paid Plex subscription for user:', userId, 'type:', plex_subscription);
  }
}

// Handle IPTV subscription (NO FREE OPTION)
if (iptv_subscription && iptv_subscription !== 'remove' && iptv_expiration) {
  await db.query(`
    INSERT INTO subscriptions (user_id, subscription_type_id, start_date, expiration_date, status)
    VALUES (?, ?, CURDATE(), ?, 'active')
  `, [userId, parseInt(iptv_subscription), iptv_expiration]);
  console.log('✅ Created paid IPTV subscription for user:', userId, 'type:', iptv_subscription);
}

	  
	        if (plex_email && plex_libraries && Object.keys(plex_libraries).length > 0) {
        try {
          console.log(`🔄 Checking pending invites for new user: ${name}`);
          
          const pendingInvites = await plexService.checkUserPendingInvites(plex_email);
          
          // Update pending invites in database
          await db.query(`
            UPDATE users 
            SET pending_plex_invites = ?, updated_at = NOW()
            WHERE id = ?
          `, [pendingInvites ? JSON.stringify(pendingInvites) : null, userId]);
          
          console.log(`✅ Updated pending invites for new user ${name}`);
          
        } catch (error) {
          console.error(`⚠️ Could not sync pending invites for new user ${name}:`, error.message);
          // Don't fail the whole request if pending invite sync fails
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
  bcc_owner_renewal, exclude_bulk_emails, exclude_automated_emails,
  tags, plex_libraries, _skipTagProcessing,
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
    bcc_owner_renewal = ?, exclude_bulk_emails = ?, exclude_automated_emails = ?,
    tags = ?, plex_libraries = ?
  WHERE id = ?
`, [
  name, email, owner_id || null, plex_email || null,
  iptv_username || null, iptv_password || null, implayer_code || null, device_count || 1,
  bcc_owner_renewal || false, exclude_bulk_emails || false, exclude_automated_emails || false,
  JSON.stringify(finalTags), JSON.stringify(plex_libraries || {}),
  req.params.id
]);

    console.log('✅ Updated user basic info for ID:', req.params.id);

// BULLETPROOF SUBSCRIPTION HANDLING - REPLACE ENTIRE SECTION

// Handle subscription updates if provided
try {
  const userId = req.params.id;

  // BULLETPROOF Helper function to cancel all subscriptions of a specific type
  async function cancelAllSubscriptionsOfType(userId, subscriptionType) {
    console.log(`🗑️ Cancelling all ${subscriptionType} subscriptions for user ${userId}`);
    
    let result;
    
    if (subscriptionType === 'plex') {
      // For Plex, cancel both paid subscriptions AND FREE (NULL) subscriptions
      result = await db.query(`
        UPDATE subscriptions s
        LEFT JOIN subscription_types st ON s.subscription_type_id = st.id
        SET s.status = 'cancelled', s.updated_at = NOW()
        WHERE s.user_id = ?
          AND s.status = 'active'
          AND (s.subscription_type_id IS NULL OR st.type = 'plex')
      `, [userId]);
    } else {
      // For IPTV, only cancel paid subscriptions (no FREE IPTV)
      result = await db.query(`
        UPDATE subscriptions s
        JOIN subscription_types st ON s.subscription_type_id = st.id
        SET s.status = 'cancelled', s.updated_at = NOW()
        WHERE s.user_id = ?
          AND st.type = ?
          AND s.status = 'active'
      `, [userId, subscriptionType]);
    }
    
    console.log(`✅ Cancelled ${result.affectedRows} existing ${subscriptionType} subscriptions`);
    return result.affectedRows;
  }

  // Handle Plex subscription updates - WITH MANUAL EXPIRATION OVERRIDE SUPPORT
  if (plex_subscription !== undefined && plex_subscription !== null) {
    console.log(`🔄 Processing Plex subscription update: "${plex_subscription}"`);
    console.log(`🗓️ Manual Plex expiration override: "${plex_expiration}"`);
    
    if (plex_subscription === 'remove') {
      // REMOVE: Cancel all Plex subscriptions
      await cancelAllSubscriptionsOfType(userId, 'plex');
      console.log(`✅ REMOVED all Plex subscriptions for user ${userId}`);

    } else if (plex_subscription === 'free') {
      // FREE: Cancel existing + Create FREE subscription
      console.log(`🆓 Setting user ${userId} to FREE Plex access...`);
      
      // Cancel existing subscriptions
      await cancelAllSubscriptionsOfType(userId, 'plex');
      
      // Create FREE subscription (NULL subscription_type_id, NULL expiration_date)
      try {
        await db.query(`
          INSERT INTO subscriptions (user_id, subscription_type_id, start_date, expiration_date, status)
          VALUES (?, NULL, CURDATE(), NULL, 'active')
        `, [userId]);
        console.log(`✅ CREATED FREE Plex subscription for user ${userId}`);
      } catch (insertError) {
        console.error(`❌ Error creating FREE Plex subscription:`, insertError);
        throw new Error(`Failed to create FREE subscription: ${insertError.message}`);
      }

    } else if (plex_subscription && plex_subscription !== '') {
      // PAID: Cancel existing + Create paid subscription
      console.log(`💰 Setting user ${userId} to PAID Plex subscription ${plex_subscription}...`);
      
      // Step 1: Cancel existing subscriptions
      await cancelAllSubscriptionsOfType(userId, 'plex');
      
      // Step 2: Wait a moment for database consistency
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Step 3: Determine expiration date - MANUAL OVERRIDE SUPPORT
      let finalExpirationDate;
      
      if (plex_expiration && plex_expiration.trim() !== '') {
        // Use manually provided expiration date
        finalExpirationDate = plex_expiration;
        console.log(`🎯 Using MANUAL Plex expiration: ${finalExpirationDate}`);
      } else {
        // Auto-calculate expiration date from subscription type
        const [subscriptionType] = await db.query(
          'SELECT duration_months FROM subscription_types WHERE id = ?', 
          [parseInt(plex_subscription)]
        );
        
        if (subscriptionType && subscriptionType.duration_months) {
          const today = new Date();
          const expiration = new Date();
          expiration.setMonth(today.getMonth() + subscriptionType.duration_months);
          finalExpirationDate = expiration.toISOString().split('T')[0];
          console.log(`🤖 Auto-calculated Plex expiration: ${finalExpirationDate} (${subscriptionType.duration_months} months)`);
        } else {
          throw new Error(`Subscription type ${plex_subscription} not found or has no duration`);
        }
      }
      
      // Step 4: Create new paid subscription with final expiration date
      try {
        await db.query(`
          INSERT INTO subscriptions (user_id, subscription_type_id, start_date, expiration_date, status)
          VALUES (?, ?, CURDATE(), ?, 'active')
        `, [userId, parseInt(plex_subscription), finalExpirationDate]);
        console.log(`✅ CREATED paid Plex subscription for user ${userId}, expires: ${finalExpirationDate}`);
      } catch (insertError) {
        console.error(`❌ Error creating paid Plex subscription:`, insertError);
        throw new Error(`Failed to create paid subscription: ${insertError.message}`);
      }
    } else {
      console.log(`ℹ️ Keeping current Plex subscription for user ${userId} (no change)`);
    }
  }
  // CRITICAL FIX: Handle manual Plex expiration date changes even when subscription type is not changed
  else if (plex_expiration && plex_expiration.trim() !== '') {
    console.log(`🗓️ MANUAL-ONLY Plex expiration update: "${plex_expiration}"`);
    
    // Update existing Plex subscription expiration date
    const result = await db.query(`
      UPDATE subscriptions s
      LEFT JOIN subscription_types st ON s.subscription_type_id = st.id
      SET s.expiration_date = ?, s.updated_at = NOW()
      WHERE s.user_id = ?
        AND s.status = 'active'
        AND (s.subscription_type_id IS NULL OR st.type = 'plex')
    `, [plex_expiration, userId]);
    
    if (result.affectedRows > 0) {
      console.log(`✅ Updated Plex expiration date to: ${plex_expiration} for user ${userId}`);
    } else {
      console.log(`⚠️ No active Plex subscription found to update for user ${userId}`);
    }
  }

  // Handle IPTV subscription updates - WITH MANUAL EXPIRATION OVERRIDE SUPPORT
  if (iptv_subscription !== undefined && iptv_subscription !== null) {
    console.log(`🔄 Processing IPTV subscription update: "${iptv_subscription}"`);
    console.log(`🗓️ Manual IPTV expiration override: "${iptv_expiration}"`);
    
    if (iptv_subscription === 'remove') {
      // REMOVE: Cancel all IPTV subscriptions
      await cancelAllSubscriptionsOfType(userId, 'iptv');
      console.log(`✅ REMOVED all IPTV subscriptions for user ${userId}`);

    } else if (iptv_subscription && iptv_subscription !== '') {
      // PAID: Cancel existing + Create paid IPTV subscription (no free IPTV)
      console.log(`💰 Setting user ${userId} to PAID IPTV subscription ${iptv_subscription}...`);
      
      // Step 1: Cancel existing subscriptions
      await cancelAllSubscriptionsOfType(userId, 'iptv');
      
      // Step 2: Wait a moment for database consistency
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Step 3: Determine expiration date - MANUAL OVERRIDE SUPPORT
      let finalExpirationDate;
      
      if (iptv_expiration && iptv_expiration.trim() !== '') {
        // Use manually provided expiration date
        finalExpirationDate = iptv_expiration;
        console.log(`🎯 Using MANUAL IPTV expiration: ${finalExpirationDate}`);
      } else {
        // Auto-calculate expiration date from subscription type
        const [subscriptionType] = await db.query(
          'SELECT duration_months FROM subscription_types WHERE id = ?', 
          [parseInt(iptv_subscription)]
        );
        
        if (subscriptionType && subscriptionType.duration_months) {
          const today = new Date();
          const expiration = new Date();
          expiration.setMonth(today.getMonth() + subscriptionType.duration_months);
          finalExpirationDate = expiration.toISOString().split('T')[0];
          console.log(`🤖 Auto-calculated IPTV expiration: ${finalExpirationDate} (${subscriptionType.duration_months} months)`);
        } else {
          throw new Error(`Subscription type ${iptv_subscription} not found or has no duration`);
        }
      }
      
      // Step 4: Create new IPTV subscription with final expiration date
      try {
        await db.query(`
          INSERT INTO subscriptions (user_id, subscription_type_id, start_date, expiration_date, status)
          VALUES (?, ?, CURDATE(), ?, 'active')
        `, [userId, parseInt(iptv_subscription), finalExpirationDate]);
        console.log(`✅ CREATED IPTV subscription for user ${userId}, expires: ${finalExpirationDate}`);
      } catch (insertError) {
        console.error(`❌ Error creating IPTV subscription:`, insertError);
        throw new Error(`Failed to create IPTV subscription: ${insertError.message}`);
      }
    } else {
      console.log(`ℹ️ Keeping current IPTV subscription for user ${userId} (no change)`);
    }
  }
  // CRITICAL FIX: Handle manual IPTV expiration date changes even when subscription type is not changed
  else if (iptv_expiration && iptv_expiration.trim() !== '') {
    console.log(`🗓️ MANUAL-ONLY IPTV expiration update: "${iptv_expiration}"`);
    
    // Update existing IPTV subscription expiration date
    const result = await db.query(`
      UPDATE subscriptions s
      JOIN subscription_types st ON s.subscription_type_id = st.id
      SET s.expiration_date = ?, s.updated_at = NOW()
      WHERE s.user_id = ?
        AND st.type = 'iptv'
        AND s.status = 'active'
    `, [iptv_expiration, userId]);
    
    if (result.affectedRows > 0) {
      console.log(`✅ Updated IPTV expiration date to: ${iptv_expiration} for user ${userId}`);
    } else {
      console.log(`⚠️ No active IPTV subscription found to update for user ${userId}`);
    }
  }

  console.log(`✅ Subscription processing completed for user ${userId}`);

} catch (subscriptionError) {
  console.error('❌ SUBSCRIPTION ERROR:', subscriptionError);
  // Don't fail the entire request, but log the error
  console.error('Subscription update failed, but user info was saved successfully');
}

    res.json({ message: 'User updated successfully' });

  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Enhanced user update that also syncs pending invites (ADDITION)
router.put('/:id/enhanced', async (req, res) => {
  try {
    const userId = req.params.id;
const {
  name, email, owner_id, plex_email, iptv_username, iptv_password, 
  implayer_code, device_count, bcc_owner_renewal, exclude_bulk_emails, exclude_automated_emails,
  plex_libraries
} = req.body;

    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    // Check if email is already taken by another user
    const [existingUser] = await db.query(
      'SELECT id FROM users WHERE email = ? AND id != ?',
      [email, userId]
    );

    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Prepare library data
    const libraryData = plex_libraries ? JSON.stringify(plex_libraries) : null;

    // Update user
await db.query(`
  UPDATE users SET
    name = ?, email = ?, owner_id = ?, plex_email = ?, 
    iptv_username = ?, iptv_password = ?, implayer_code = ?, 
    device_count = ?, bcc_owner_renewal = ?, exclude_bulk_emails = ?, exclude_automated_emails = ?,
    plex_libraries = ?, updated_at = NOW()
  WHERE id = ?
`, [
  name, email, owner_id || null, plex_email || null,
  iptv_username || null, iptv_password || null, implayer_code || null,
  device_count || 1, bcc_owner_renewal || false, exclude_bulk_emails || false, exclude_automated_emails || false,
  libraryData, userId
]);

    // If user has Plex access, sync their pending invites immediately
    if (plex_email && plex_libraries && Object.keys(plex_libraries).length > 0) {
      try {
        console.log(`🔄 Syncing pending invites for updated user: ${name}`);
        
        const pendingInvites = await plexService.checkUserPendingInvites(plex_email);
        
        // Update pending invites in database
        await db.query(`
          UPDATE users 
          SET pending_plex_invites = ?, updated_at = NOW()
          WHERE id = ?
        `, [pendingInvites ? JSON.stringify(pendingInvites) : null, userId]);
        
        console.log(`✅ Updated pending invites for ${name}`);
        
      } catch (error) {
        console.error(`⚠️ Could not sync pending invites for ${name}:`, error.message);
        // Don't fail the whole request if pending invite sync fails
      }
    } else {
      // Clear pending invites if user no longer has Plex access
      await db.query(`
        UPDATE users 
        SET pending_plex_invites = NULL
        WHERE id = ?
      `, [userId]);
    }

    // Get updated user data
    const [updatedUser] = await db.query(`
      SELECT u.*, o.name as owner_name, o.email as owner_email
      FROM users u
      LEFT JOIN owners o ON u.owner_id = o.id
      WHERE u.id = ?
    `, [userId]);

    res.json({
      message: 'User updated successfully',
      user: updatedUser
    });

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
		AND st.price > 0
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

// Enhanced remove all Plex access for a user
router.post('/:id/remove-plex-access', async (req, res) => {
  try {
    const userId = req.params.id;
    
    console.log(`🗑️ API: Complete Plex removal request for user ID: ${userId}`);
    
    // Get user data
    const [user] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userEmail = user.plex_email || user.email;
    
    if (!userEmail) {
      return res.status(400).json({ error: 'User has no email configured for Plex removal' });
    }
    
    console.log(`📧 Using email for Plex removal: ${userEmail}`);
    
    // Get current user tags to determine which server groups to remove from
    const currentTags = user.tags ? JSON.parse(user.tags) : [];
    const serverGroupsToRemove = [];
    
    if (currentTags.includes('Plex 1')) {
      serverGroupsToRemove.push('plex1');
    }
    if (currentTags.includes('Plex 2')) {
      serverGroupsToRemove.push('plex2');
    }
    
    // If user has no Plex tags, still try to remove from all servers for safety
    if (serverGroupsToRemove.length === 0) {
      serverGroupsToRemove.push('plex1', 'plex2');
      console.log(`⚠️ User has no Plex tags, will attempt removal from all servers for safety`);
    }
    
    console.log(`🎯 Will remove from server groups:`, serverGroupsToRemove);
    
    // Step 1: Remove from Plex servers (including pending invites)
    const pythonPlexService = require('../python-plex-wrapper');
    const plexRemovalResult = await pythonPlexService.removeUserCompletely(userEmail, serverGroupsToRemove);
    
    console.log(`🗑️ Plex removal result:`, plexRemovalResult);
    
    // Step 2: Clear Plex-related data from database
    const updateData = {
      plex_email: null,
      plex_libraries: JSON.stringify({ plex1: { regular: [], fourk: [] }, plex2: { regular: [], fourk: [] } })
    };
    
    // Step 3: Remove Plex tags
    const updatedTags = currentTags.filter(tag => !['Plex 1', 'Plex 2'].includes(tag));
    updateData.tags = JSON.stringify(updatedTags);
    
    // Step 4: Remove Plex subscriptions
    await db.query('DELETE FROM subscriptions WHERE user_id = ? AND subscription_type_id IN (SELECT id FROM subscription_types WHERE name LIKE "%Plex%")', [userId]);
    
    // Step 5: Update user record
    const updateFields = Object.keys(updateData).map(key => `${key} = ?`).join(', ');
    const updateValues = Object.values(updateData);
    updateValues.push(userId);
    
    await db.query(`UPDATE users SET ${updateFields}, updated_at = NOW() WHERE id = ?`, updateValues);
    
    console.log(`💾 Database updated - removed Plex data and subscriptions`);
    
    // Prepare response
    const removedTags = currentTags.filter(tag => ['Plex 1', 'Plex 2'].includes(tag));
    const invitesCancelled = plexRemovalResult.summary?.invites_cancelled || 0;
    const usersRemoved = plexRemovalResult.summary?.users_removed || 0;
    
    res.json({
      success: plexRemovalResult.success,
      message: `Complete Plex removal ${plexRemovalResult.success ? 'completed' : 'completed with some issues'}`,
      details: {
        plexRemoval: plexRemovalResult,
        databaseUpdated: true,
        subscriptionsRemoved: true,
        serverGroupsProcessed: serverGroupsToRemove,
        invitesCancelled: invitesCancelled,
        usersRemoved: usersRemoved,
        removedTags: removedTags,
        clearedPlexEmail: !!user.plex_email,
        clearedLibraryAccess: true
      },
      summary: {
        totalActions: invitesCancelled + usersRemoved + (removedTags.length > 0 ? 1 : 0) + 1, // +1 for database update
        serverGroupsProcessed: serverGroupsToRemove.length,
        invitesCancelled: invitesCancelled,
        usersRemoved: usersRemoved,
        removedTags: removedTags
      },
      user: {
        id: userId,
        name: user.name,
        email: userEmail,
        previousTags: currentTags,
        newTags: updatedTags
      }
    });
    
  } catch (error) {
    console.error('❌ Error in complete Plex removal:', error);
    res.status(500).json({ 
      error: 'Failed to remove Plex access completely',
      details: error.message 
    });
  }
});

// Get user with enhanced Plex status (invite status + current access)
router.get('/:id/plex-status', async (req, res) => {
  try {
    const userId = req.params.id;
    
    console.log(`🔍 API: Getting enhanced Plex status for user ID: ${userId}`);
    
    // Get user data
    const [user] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userEmail = user.plex_email || user.email;
    
    if (!userEmail) {
      return res.json({
        success: true,
        user: { id: userId, name: user.name },
        hasEmail: false,
        message: 'User has no email configured for Plex'
      });
    }
    
    // Get current library access
    const plexService = require('../plex-service');
    const currentAccess = await plexService.getUserCurrentAccess(userEmail);
    
    // Get invite status
    const pythonPlexService = require('../python-plex-wrapper');
    const inviteStatus = await pythonPlexService.checkInviteStatus(userEmail);
    
    // Analyze the data
    const hasAnyAccess = Object.values(currentAccess).some(serverAccess => 
      serverAccess.regular.length > 0 || serverAccess.fourk.length > 0
    );
    
    const hasPendingInvites = inviteStatus.summary?.has_pending_invites || false;
    const pendingServers = inviteStatus.summary?.pending_servers || [];
    
    res.json({
      success: true,
      user: {
        id: userId,
        name: user.name,
        email: userEmail,
        tags: user.tags ? JSON.parse(user.tags) : []
      },
      hasEmail: true,
      currentAccess: currentAccess,
      inviteStatus: inviteStatus,
      summary: {
        hasAnyAccess: hasAnyAccess,
        hasPendingInvites: hasPendingInvites,
        pendingServers: pendingServers,
        totalLibraries: Object.values(currentAccess).reduce((total, serverAccess) => 
          total + serverAccess.regular.length + serverAccess.fourk.length, 0
        ),
        status: hasPendingInvites ? 'pending_invites' : (hasAnyAccess ? 'has_access' : 'no_access')
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting user Plex status:', error);
    res.status(500).json({ 
      error: 'Failed to get user Plex status',
      details: error.message 
    });
  }
});

module.exports = router;