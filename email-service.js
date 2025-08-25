// email-service.js - COMPLETE REPLACEMENT FILE
const nodemailer = require('nodemailer');
const db = require('./database-config');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  async initializeTransporter() {
    try {
      const settings = await this.getEmailSettings();
      
      if (!settings.smtp_host || !settings.smtp_user || !settings.smtp_pass) {
        console.warn('Email settings not configured - email functionality will be disabled');
        return;
      }

      this.transporter = nodemailer.createTransport({
        host: settings.smtp_host,
        port: parseInt(settings.smtp_port) || 587,
        secure: false,
        auth: {
          user: settings.smtp_user,
          pass: settings.smtp_pass,
        },
        tls: {
          rejectUnauthorized: false,
        },
      });

      // Test connection
      await this.transporter.verify();
      console.log('? Email service initialized successfully');
    } catch (error) {
      console.error('? Email service initialization failed:', error.message);
      this.transporter = null;
    }
  }

  async getEmailSettings() {
    try {
      const settings = await db.query('SELECT setting_key, setting_value FROM settings WHERE setting_key LIKE "smtp_%"');
      const settingsMap = {};
      settings.forEach(setting => {
        settingsMap[setting.setting_key] = setting.setting_value;
      });
      return settingsMap;
    } catch (error) {
      console.error('Error fetching email settings:', error);
      return {};
    }
  }

async sendEmail(to, subject, htmlBody, options = {}) {
    try {
      if (!this.transporter) {
        console.error('? Email transporter not initialized');
        return { success: false, error: 'Email service not configured' };
      }

      const mailOptions = {
        from: options.from || process.env.SMTP_USER,
        to: to,
        subject: subject,
        html: htmlBody
      };

      // FIXED: Add CC support
      if (options.cc && options.cc.length > 0) {
        mailOptions.cc = Array.isArray(options.cc) ? options.cc : [options.cc];
      }

      // FIXED: Add BCC support  
      if (options.bcc && options.bcc.length > 0) {
        mailOptions.bcc = Array.isArray(options.bcc) ? options.bcc : [options.bcc];
      }

      console.log('?? Sending email with options:', {
        to: mailOptions.to,
        cc: mailOptions.cc || 'none',
        bcc: mailOptions.bcc || 'none',
        subject: mailOptions.subject
      });

      const result = await this.transporter.sendMail(mailOptions);
      
      // Log email to database
      if (options.userId) {
        await this.logEmail(options.userId, to, subject, options.templateName || 'Manual', 'sent');
      }

      console.log(`? Email sent to ${to}: ${subject}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error(`? Failed to send email to ${to}:`, error.message);
      
      // Log failed email
      if (options.userId) {
        await this.logEmail(options.userId, to, subject, options.templateName || 'Manual', 'failed', error.message);
      }
      
      return { success: false, error: error.message };
    }
  }

  async logEmail(userId, email, subject, templateName, status, errorMessage = null) {
    try {
      await db.query(`
        INSERT INTO email_logs (user_id, recipient_email, subject, template_used, status, error_message)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [userId, email, subject, templateName, status, errorMessage]);
    } catch (error) {
      console.error('Error logging email:', error);
    }
  }

  async getTemplate(templateName) {
    try {
      const templates = await db.query('SELECT * FROM email_templates WHERE name = ?', [templateName]);
      return templates.length > 0 ? templates[0] : null;
    } catch (error) {
      console.error('Error fetching template:', error);
      return null;
    }
  }

  async replacePlaceholders(templateBody, userData) {
    try {
      let processedBody = templateBody;
      
      // Get settings for payment links
      const settings = await db.query('SELECT setting_key, setting_value FROM settings');
      const settingsMap = {};
      settings.forEach(setting => {
        settingsMap[setting.setting_key] = setting.setting_value;
      });
      

// Define all possible placeholders
const placeholders = {
  // Basic user info
  name: userData.name || '',
  email: userData.email || '',
  username: userData.username || userData.name || '',
  
  // Owner info
  owner_name: userData.owner_name || '',
  owner_email: userData.owner_email || '',
  
  // Plex info
  plex_email: userData.plex_email || userData.email || '',
  plex_expiration: userData.plex_expiration || userData.expiration_date || '',
  plex_subscription_type: userData.plex_subscription_type || userData.subscription_type || '',
  plex_days_until_expiration: userData.plex_days_until_expiration || userData.days_until_expiration || '',
  plex_renewal_price: userData.plex_renewal_price || userData.renewal_price || '',
  
  // IPTV info
  iptv_username: userData.iptv_username || '',
  iptv_password: userData.iptv_password || '',
  iptv_expiration: userData.iptv_expiration || userData.expiration_date || '',
  iptv_subscription_type: userData.iptv_subscription_type || userData.subscription_type || '',
  iptv_days_until_expiration: userData.iptv_days_until_expiration || userData.days_until_expiration || '',
  iptv_renewal_price: userData.iptv_renewal_price || userData.renewal_price || '',
  
  // Device info
  implayer_code: userData.implayer_code || '',
  device_count: userData.device_count || '',
  
  // General subscription info (legacy fields for backward compatibility)
  subscription_name: userData.subscription_name || '',
  subscription_type: userData.subscription_type || '',
  expiration_date: userData.expiration_date || '',
  days_until_expiration: userData.days_until_expiration || '',
  renewal_price: userData.renewal_price || '',
  
  // Payment links from settings
  paypal_link: settingsMap.paypal_link || '#',
  venmo_link: settingsMap.venmo_link || '#',
  cashapp_link: settingsMap.cashapp_link || '#'
};

      // Replace all placeholders
      for (const [key, value] of Object.entries(placeholders)) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        processedBody = processedBody.replace(regex, value);
      }
      
      return processedBody;
    } catch (error) {
      console.error('Error processing template:', error);
      return templateBody;
    }
  }

  async processTemplate(templateBody, userData) {
    return await this.replacePlaceholders(templateBody, userData);
  }

  async sendTemplateEmail(userId, templateName, userData, options = {}) {
    try {
      const template = await this.getTemplate(templateName);
      if (!template) {
        throw new Error(`Template "${templateName}" not found`);
      }

      const processedSubject = await this.processTemplate(template.subject, userData);
      const processedBody = await this.processTemplate(template.body, userData);

      return await this.sendEmail(
        userData.email,
        processedSubject,
        processedBody,
        { ...options, userId, templateName }
      );
    } catch (error) {
      console.error('Error sending template email:', error);
      return { success: false, error: error.message };
    }
  }
  
  // ===== AUTOMATED EMAIL SCHEDULER METHODS =====
  
async processScheduledEmails() {
  try {
    console.log('?? Processing scheduled emails...');
    
    // ONLY process specific_date emails in hourly runs
    // Expiration reminders run separately in the daily job
    const schedules = await db.query(`
      SELECT es.*, et.subject, et.body, et.name as template_name
      FROM email_schedules es
      LEFT JOIN email_templates et ON es.email_template_id = et.id
      WHERE es.active = TRUE 
        AND es.schedule_type = 'specific_date'
      ORDER BY es.id
    `);

    console.log(`?? Found ${schedules.length} active specific date schedules`);

    for (const schedule of schedules) {
      await this.processIndividualSchedule(schedule);
    }

    console.log('? Finished processing specific date emails');
  } catch (error) {
    console.error('? Error processing scheduled emails:', error);
  }
}

async processExpirationReminders() {
  try {
    console.log('?? Processing expiration reminder schedules...');
    
    // ONLY process expiration_reminder emails in daily runs
    const schedules = await db.query(`
      SELECT es.*, et.subject, et.body, et.name as template_name
      FROM email_schedules es
      LEFT JOIN email_templates et ON es.email_template_id = et.id
      WHERE es.active = TRUE 
        AND es.schedule_type = 'expiration_reminder'
      ORDER BY es.id
    `);

    console.log(`?? Found ${schedules.length} active expiration reminder schedules`);

    for (const schedule of schedules) {
      await this.processIndividualSchedule(schedule);
    }

    console.log('? Finished processing expiration reminder emails');
  } catch (error) {
    console.error('? Error processing expiration reminder emails:', error);
  }
}

async processIndividualSchedule(schedule) {
  try {
    console.log(`?? Processing schedule: ${schedule.name} (ID: ${schedule.id})`);
    
    const now = new Date();
    let shouldRun = false;
    let targetUsers = [];

    // FIXED: Helper function that ensures arrays are returned for filtering
    const parseTargetData = (targetData) => {
      if (!targetData) return null;
      
      console.log(`?? Parsing target data: ${targetData} (type: ${typeof targetData})`);
      
      try {
        let parsed;
        
        // If it's already an object/number, use it directly
        if (typeof targetData === 'number') {
          parsed = targetData;
        } else if (typeof targetData === 'string') {
          parsed = JSON.parse(targetData);
        } else {
          parsed = targetData;
        }
        
        console.log(`?? Parsed result: ${JSON.stringify(parsed)} (type: ${typeof parsed}, isArray: ${Array.isArray(parsed)})`);
        
        // CRITICAL FIX: Always convert to array format for filtering
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter(item => item !== '' && item !== null && item !== undefined);
          console.log(`?? Filtered array: ${JSON.stringify(filtered)}`);
          return filtered.length > 0 ? filtered : null;
        } else if (parsed !== null && parsed !== undefined && parsed !== '') {
          // Convert single values to arrays
          const arrayResult = [parsed];
          console.log(`?? Converted single value to array: ${JSON.stringify(arrayResult)}`);
          return arrayResult;
        }
        
        return null;
      } catch (e) {
        console.log(`?? JSON parse error for schedule ${schedule.id}: ${e.message}, raw data: ${targetData}`);
        return null;
      }
    };

    if (schedule.schedule_type === 'expiration_reminder') {
      console.log(`   ? Expiration reminder: ${schedule.days_before_expiration} days before, type: ${schedule.subscription_type}`);
      
      // FIXED: Parse and convert to arrays for proper filtering
      const targetTags = parseTargetData(schedule.target_tags);
      const targetOwners = parseTargetData(schedule.target_owners);
      const targetSubscriptionTypes = parseTargetData(schedule.target_subscription_types);
      
      console.log(`?? Final parsed values (converted to arrays):`);
      console.log(`   ? targetTags: ${targetTags ? JSON.stringify(targetTags) : 'null'}`);
      console.log(`   ? targetOwners: ${targetOwners ? JSON.stringify(targetOwners) : 'null'}`);
      console.log(`   ? targetSubscriptionTypes: ${targetSubscriptionTypes ? JSON.stringify(targetSubscriptionTypes) : 'null'}`);
      
      targetUsers = await this.getExpiringUsers(
        schedule.days_before_expiration,
        schedule.subscription_type,
        targetTags,
        targetOwners,
        targetSubscriptionTypes,
        schedule.exclude_users_with_setting
      );
      
      shouldRun = targetUsers.length > 0;
      console.log(`   ? Found ${targetUsers.length} expiring users`);
      
    } else if (schedule.schedule_type === 'specific_date') {
      console.log(`   ? Specific date schedule: ${schedule.next_run}`);
      
      if (schedule.next_run) {
        const nextRun = new Date(schedule.next_run);
        shouldRun = now >= nextRun;
        console.log(`   ? Should run? ${shouldRun} (now: ${now.toISOString()}, next: ${nextRun.toISOString()})`);
        
        if (shouldRun) {
          const targetTags = parseTargetData(schedule.target_tags);
          const targetOwners = parseTargetData(schedule.target_owners);
          const targetSubscriptionTypes = parseTargetData(schedule.target_subscription_types);
          
          targetUsers = await this.getAllTargetUsers(
            targetTags,
            targetOwners, 
            targetSubscriptionTypes,
            schedule.exclude_users_with_setting
          );
        }
      }
    }

    if (shouldRun && targetUsers.length > 0) {
      console.log(`?? Running schedule: ${schedule.name} for ${targetUsers.length} users`);
      
      let sentCount = 0;
      
      if (schedule.schedule_type === 'specific_date') {
        // For specific date emails, send as bulk with BCC to all owners
        const allOwnerEmails = [...new Set(targetUsers
          .filter(user => user.owner_email)
          .map(user => user.owner_email)
        )];
        
        const processedBody = await this.replacePlaceholders(schedule.body, {});
        const processedSubject = await this.replacePlaceholders(schedule.subject, {});
        
        const result = await this.sendEmail(
          targetUsers.map(user => user.email), 
          processedSubject, 
          processedBody,
          {
            bcc: allOwnerEmails,
            templateName: schedule.template_name
          }
        );
        
        if (result.success) {
          sentCount = targetUsers.length;
        }
        console.log(`? Specific date emails: ${sentCount}/${targetUsers.length} sent as bulk`);
        
      } else {
        // For expiration reminders, send individual emails with owner BCC if enabled
        for (const user of targetUsers) {
          try {
            const personalizedBody = await this.replacePlaceholders(schedule.body, user);
            const personalizedSubject = await this.replacePlaceholders(schedule.subject, user);
            
            const emailOptions = {
              userId: user.id,
              templateName: schedule.template_name
            };

            // ONLY add owner BCC for renewal emails if user has it enabled
            if (user.bcc_owner_renewal && user.owner_email) {
              emailOptions.bcc = [user.owner_email];
              console.log(`   ? Adding owner BCC: ${user.owner_email} for user ${user.name}`);
            }
            
            const result = await this.sendEmail(user.email, personalizedSubject, personalizedBody, emailOptions);

            if (result.success) {
              sentCount++;
            }
          } catch (error) {
            console.error(`   ? Error sending to ${user.name}:`, error);
          }
        }
        console.log(`? Expiration reminder emails: ${sentCount}/${targetUsers.length} sent individually`);
      }

      // Update schedule statistics
      await db.query(`
        UPDATE email_schedules 
        SET last_run = ?, run_count = COALESCE(run_count, 0) + 1,
            active = ${schedule.schedule_type === 'specific_date' ? 'FALSE' : 'TRUE'}
        WHERE id = ?
      `, [now, schedule.id]);

      console.log(`? Schedule "${schedule.name}" completed: ${sentCount}/${targetUsers.length} emails sent`);
    } else {
      console.log(`   ? Skipping schedule (shouldRun: ${shouldRun}, targetUsers: ${targetUsers.length})`);
    }
  } catch (error) {
    console.error(`? Error processing schedule ${schedule.name}:`, error);
  }
}

async getExpiringUsers(daysBefore, subscriptionType, targetTags = null, targetOwners = null, targetSubscriptionTypes = null, excludeWithSetting = true) {
  console.log(`\n?? === STARTING EMAIL FILTERING PROCESS ===`);
  console.log(`?? Finding users expiring in ${daysBefore} days (type: ${subscriptionType})`);
  console.log(`   ? Target tags: ${targetTags ? JSON.stringify(targetTags) : 'none'}`);
  console.log(`   ? Target owners: ${targetOwners ? JSON.stringify(targetOwners) : 'none'}`);
  console.log(`   ? Target subscription types: ${targetSubscriptionTypes ? JSON.stringify(targetSubscriptionTypes) : 'none'}`);
  console.log(`   ? Exclude automated emails: ${excludeWithSetting}`);
  
  try {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysBefore);
    const targetDateStr = targetDate.toISOString().split('T')[0];
    console.log(`   ? Target expiration date: ${targetDateStr}`);

    // STEP 1: Get ALL users with their subscription data (same as preview endpoint)
    console.log(`\n?? STEP 1: Getting all users with subscription data...`);
    let query = `
      SELECT u.id, u.name, u.email, u.tags, u.owner_id, u.exclude_automated_emails,
             o.name as owner_name, o.email as owner_email, u.bcc_owner_renewal,
             GROUP_CONCAT(DISTINCT s.subscription_type_id) as subscription_type_ids,
             GROUP_CONCAT(DISTINCT st.name SEPARATOR ', ') as subscription_names
      FROM users u
      LEFT JOIN owners o ON u.owner_id = o.id
      LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status = 'active'
      LEFT JOIN subscription_types st ON s.subscription_type_id = st.id
      WHERE 1=1
    `;
    
    // FIXED: Use let instead of const for params array
    let params = [];
    
    // Apply exclude automated emails filter
    if (excludeWithSetting) {
      query += ` AND u.exclude_automated_emails = FALSE`;
      console.log(`?? Added filter: exclude_automated_emails = FALSE`);
    }
    
    query += ` GROUP BY u.id, u.name, u.email, u.tags, u.owner_id, u.exclude_automated_emails, o.name, o.email, u.bcc_owner_renewal`;
    
    const allUsers = await db.query(query, params);
    console.log(`?? Found ${allUsers.length} total users before any filtering`);
    
    // Log each user's basic info
    allUsers.forEach(user => {
      console.log(`   ?? ${user.name} (ID: ${user.id}, Owner: ${user.owner_id}, Sub IDs: ${user.subscription_type_ids || 'none'})`);
    });

    // STEP 2: Filter users by expiration date and subscription type
    console.log(`\n? STEP 2: Checking for expiring subscriptions...`);
    let usersWithExpiringSubscriptions = [];
    
    for (const user of allUsers) {
      console.log(`\n   ?? Checking user: ${user.name} (ID: ${user.id})`);
      
      // Get this user's expiring subscriptions for the target date
      let expiringSubscriptionsQuery = `
        SELECT s.*, st.type as subscription_type, st.name as subscription_name
        FROM subscriptions s
        JOIN subscription_types st ON s.subscription_type_id = st.id
        WHERE s.user_id = ? 
          AND s.status = 'active'
          AND DATE(s.expiration_date) = ?
      `;
      
      // FIXED: Use let instead of const for params array
      let expiringSubscriptionsParams = [user.id, targetDateStr];
      
      // Add subscription type filter
      if (subscriptionType === 'plex') {
        expiringSubscriptionsQuery += ` AND st.type = 'plex'`;
        console.log(`   ? Looking for PLEX subscriptions expiring on ${targetDateStr}`);
      } else if (subscriptionType === 'iptv') {
        expiringSubscriptionsQuery += ` AND st.type = 'iptv'`;
        console.log(`   ? Looking for IPTV subscriptions expiring on ${targetDateStr}`);
      } else if (subscriptionType === 'both') {
        expiringSubscriptionsQuery += ` AND st.type IN ('plex', 'iptv')`;
        console.log(`   ? Looking for PLEX or IPTV subscriptions expiring on ${targetDateStr}`);
      }
      
      const expiringSubscriptions = await db.query(expiringSubscriptionsQuery, expiringSubscriptionsParams);
      
      console.log(`   ? Found ${expiringSubscriptions.length} expiring subscriptions for ${user.name}`);
      expiringSubscriptions.forEach(sub => {
        console.log(`      ?? ${sub.subscription_name} (Type: ${sub.subscription_type}, Expires: ${sub.expiration_date})`);
      });
      
      // If user has expiring subscriptions of the target type, add them
      if (expiringSubscriptions.length > 0) {
        console.log(`   ? ${user.name} HAS expiring subscriptions - INCLUDED`);
        usersWithExpiringSubscriptions.push(user);
      } else {
        console.log(`   ? ${user.name} has NO expiring subscriptions - EXCLUDED`);
      }
    }
    
    console.log(`\n? Found ${usersWithExpiringSubscriptions.length} users with expiring subscriptions:`);
    usersWithExpiringSubscriptions.forEach(user => {
      console.log(`   ? ${user.name} (ID: ${user.id})`);
    });

    // STEP 3: Apply additional filtering (EXACTLY like preview endpoint)
    console.log(`\n?? STEP 3: Applying additional filters...`);
    let filteredUsers = usersWithExpiringSubscriptions;
    
    // Filter by tags
    if (targetTags && targetTags.length > 0 && targetTags[0] !== '') {
      console.log(`\n???  APPLYING TAG FILTER: ${JSON.stringify(targetTags)}`);
      const beforeTagFilter = filteredUsers.length;
      
      filteredUsers = filteredUsers.filter(user => {
        const userTags = user.tags ? JSON.parse(user.tags) : [];
        const hasMatchingTag = targetTags.some(tag => userTags.includes(tag));
        console.log(`   ?? ${user.name}: User tags = ${JSON.stringify(userTags)}, Match = ${hasMatchingTag}`);
        return hasMatchingTag;
      });
      
      console.log(`???  Tag filtering: ${beforeTagFilter} ? ${filteredUsers.length} users`);
    } else {
      console.log(`???  NO TAG FILTER applied (target_tags is empty or null)`);
    }
    
    // Filter by owners
    if (targetOwners && targetOwners.length > 0 && targetOwners[0] !== '') {
      console.log(`\n?? APPLYING OWNER FILTER: ${JSON.stringify(targetOwners)}`);
      const beforeOwnerFilter = filteredUsers.length;
      
      filteredUsers = filteredUsers.filter(user => {
        const hasMatchingOwner = targetOwners.includes(user.owner_id);
        console.log(`   ?? ${user.name}: Owner ID = ${user.owner_id}, Target owners = ${JSON.stringify(targetOwners)}, Match = ${hasMatchingOwner}`);
        return hasMatchingOwner;
      });
      
      console.log(`?? Owner filtering: ${beforeOwnerFilter} ? ${filteredUsers.length} users`);
    } else {
      console.log(`?? NO OWNER FILTER applied (target_owners is empty or null)`);
    }
    
    // Filter by subscription types - EXACT COPY from preview endpoint
    if (targetSubscriptionTypes && targetSubscriptionTypes.length > 0 && targetSubscriptionTypes[0] !== '') {
      console.log(`\n?? APPLYING SUBSCRIPTION TYPE FILTER: ${JSON.stringify(targetSubscriptionTypes)}`);
      const beforeSubFilter = filteredUsers.length;
      
      filteredUsers = filteredUsers.filter(user => {
        console.log(`   ?? ${user.name}: Checking subscription type filter...`);
        
        // Handle 'free' subscription type (no subscription_type_ids)
        if (targetSubscriptionTypes.includes('free') && (!user.subscription_type_ids || user.subscription_type_ids === null)) {
          console.log(`      ? User has FREE subscription and 'free' is in target list`);
          return true;
        }
        
        // Parse the comma-separated subscription_type_ids
        if (user.subscription_type_ids) {
          const userSubscriptionIds = user.subscription_type_ids.split(',').map(id => parseInt(id.trim()));
          console.log(`      ?? User subscription IDs: ${JSON.stringify(userSubscriptionIds)}`);
          console.log(`      ?? Target subscription IDs: ${JSON.stringify(targetSubscriptionTypes)}`);
          
          const hasMatch = targetSubscriptionTypes.some(targetId => {
            if (targetId === 'free') return false; // Already handled above
            const match = userSubscriptionIds.includes(parseInt(targetId));
            console.log(`         ?? Checking if user has subscription ID ${targetId}: ${match}`);
            return match;
          });
          
          console.log(`      ${hasMatch ? '?' : '?'} Final subscription type match: ${hasMatch}`);
          return hasMatch;
        }
        
        console.log(`      ? User has no subscription_type_ids`);
        return false;
      });
      
      console.log(`?? Subscription type filtering: ${beforeSubFilter} ? ${filteredUsers.length} users`);
    } else {
      console.log(`?? NO SUBSCRIPTION TYPE FILTER applied (target_subscription_types is empty or null)`);
    }
    
    console.log(`\n?? === FINAL FILTERING RESULTS ===`);
    console.log(`?? FINAL RESULT: ${filteredUsers.length} users will receive emails`);
    
    if (filteredUsers.length > 0) {
      console.log(`?? Users who WILL receive emails:`);
      filteredUsers.forEach(user => {
        console.log(`   ? ${user.name} (${user.email}) - Owner: ${user.owner_id}, Subs: ${user.subscription_type_ids || 'none'}`);
      });
    } else {
      console.log(`?? NO users will receive emails`);
    }
    
    console.log(`?? === END FILTERING PROCESS ===\n`);
	
	// STEP 4: Enhance filtered users with complete subscription data for dynamic fields
console.log(`\n✅ STEP 4: Enhancing users with complete subscription data for dynamic fields...`);

for (let i = 0; i < filteredUsers.length; i++) {
  const user = filteredUsers[i];
  
  try {
    // Get complete subscription data for this user's expiring subscription
    const completeUserData = await db.query(`
      SELECT DISTINCT u.*,
        o.name as owner_name, o.email as owner_email,
        s.expiration_date,
        st.name as subscription_type,
        st.name as subscription_name,
        st.price as renewal_price,
        st.type as subscription_category,
        DATEDIFF(s.expiration_date, CURDATE()) as days_until_expiration,
        -- Plex specific fields
        CASE WHEN st.type = 'plex' THEN COALESCE(u.plex_email, u.email) ELSE u.email END as plex_email,
        CASE WHEN st.type = 'plex' THEN s.expiration_date ELSE NULL END as plex_expiration,
        CASE WHEN st.type = 'plex' THEN st.name ELSE NULL END as plex_subscription_type,
        CASE WHEN st.type = 'plex' THEN DATEDIFF(s.expiration_date, CURDATE()) ELSE NULL END as plex_days_until_expiration,
        CASE WHEN st.type = 'plex' THEN st.price ELSE NULL END as plex_renewal_price,
        -- IPTV specific fields
        CASE WHEN st.type = 'iptv' THEN u.iptv_username ELSE NULL END as iptv_username,
        CASE WHEN st.type = 'iptv' THEN u.iptv_password ELSE NULL END as iptv_password,
        CASE WHEN st.type = 'iptv' THEN s.expiration_date ELSE NULL END as iptv_expiration,
        CASE WHEN st.type = 'iptv' THEN st.name ELSE NULL END as iptv_subscription_type,
        CASE WHEN st.type = 'iptv' THEN DATEDIFF(s.expiration_date, CURDATE()) ELSE NULL END as iptv_days_until_expiration,
        CASE WHEN st.type = 'iptv' THEN st.price ELSE NULL END as iptv_renewal_price
      FROM users u
      LEFT JOIN owners o ON u.owner_id = o.id
      LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status = 'active' AND DATE(s.expiration_date) = ?
      LEFT JOIN subscription_types st ON s.subscription_type_id = st.id
      WHERE u.id = ?
      ORDER BY s.expiration_date DESC
      LIMIT 1
    `, [targetDateStr, user.id]);
    
    if (completeUserData.length > 0) {
      // Merge the complete subscription data into the user object
      filteredUsers[i] = { ...user, ...completeUserData[0] };
      console.log(`   ✅ Enhanced ${user.name} with complete subscription data`);
    }
  } catch (error) {
    console.error(`   ❌ Error enhancing user ${user.name}:`, error);
  }
}

console.log(`✅ All ${filteredUsers.length} users enhanced with complete data for dynamic field replacement`);
    
    return filteredUsers;
    
  } catch (error) {
    console.error('? Error finding expiring users:', error);
    return [];
  }
}

async getAllUsersWithSubscriptionType(subscriptionType, targetTags = null, targetOwners = null, targetSubscriptionTypes = null, excludeWithSetting = true) {
  console.log(`?? Getting ALL users with subscription type: ${subscriptionType} (ignoring expiration dates)`);
  console.log(`   ? Target tags: ${targetTags ? JSON.stringify(targetTags) : 'none'}`);
  console.log(`   ? Target owners: ${targetOwners ? JSON.stringify(targetOwners) : 'none'}`);
  console.log(`   ? Target subscription types: ${targetSubscriptionTypes ? JSON.stringify(targetSubscriptionTypes) : 'none'}`);
  
  try {
    let query = `
      SELECT DISTINCT u.id, u.name, u.email, u.tags, u.owner_id,
             s.expiration_date, s.subscription_type_id,
             CASE 
               WHEN s.subscription_type_id IS NULL THEN 'FREE Plex Access'
               ELSE st.name 
             END as subscription_name,
             CASE 
               WHEN s.subscription_type_id IS NULL THEN 'plex'
               ELSE st.type 
             END as subscription_type,
             o.name as owner_name, o.email as owner_email,
             u.bcc_owner_renewal
      FROM users u
      LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status = 'active'
      LEFT JOIN subscription_types st ON s.subscription_type_id = st.id
      LEFT JOIN owners o ON u.owner_id = o.id
      WHERE 1=1
    `;
    
    const params = [];
    
    // Filter by subscription type (but ignore expiration dates)
    if (subscriptionType === 'plex') {
      query += ` AND st.type = 'plex'`;
    } else if (subscriptionType === 'iptv') {
      query += ` AND st.type = 'iptv'`;
    } else if (subscriptionType === 'both') {
      query += ` AND st.type IN ('plex', 'iptv')`;
    }
    
    // Exclude users with setting
    if (excludeWithSetting) {
      query += ` AND u.exclude_automated_emails = FALSE`;
    }
    
    const allUsers = await db.query(query, params);
    console.log(`   ? Found ${allUsers.length} users with ${subscriptionType} subscriptions`);
    
    // Apply additional filtering (EXACT SAME LOGIC as getExpiringUsers)
    let filteredUsers = allUsers;
    
    // Filter by tags
    if (targetTags && targetTags.length > 0) {
      filteredUsers = filteredUsers.filter(user => {
        const userTags = this.safeJsonParse(user.tags, []);
        return targetTags.some(tag => userTags.includes(tag));
      });
      console.log(`   ? After tag filtering: ${filteredUsers.length} users`);
    }
    
    // Filter by owners
    if (targetOwners && targetOwners.length > 0) {
      filteredUsers = filteredUsers.filter(user => {
        return targetOwners.includes(user.owner_id);
      });
      console.log(`   ? After owner filtering: ${filteredUsers.length} users`);
    }
    
    // Filter by subscription types
    if (targetSubscriptionTypes && targetSubscriptionTypes.length > 0) {
      filteredUsers = filteredUsers.filter(user => {
        // Handle both NULL (free) and specific subscription type IDs
        if (targetSubscriptionTypes.includes('free') && user.subscription_type_id === null) {
          return true;
        }
        return targetSubscriptionTypes.includes(user.subscription_type_id);
      });
      console.log(`   ? After subscription type filtering: ${filteredUsers.length} users`);
    }
    
    return filteredUsers;
    
  } catch (error) {
    console.error('? Error finding users with subscription type:', error);
    return [];
  }
}

  async getAllTargetUsers(targetTags = null, targetOwners = null, targetSubscriptionTypes = null, excludeAutomated = true) {
  try {
    console.log(`   ?? Getting all target users, excludeAutomated: ${excludeAutomated}`);
    console.log(`   ? Target tags: ${targetTags ? JSON.stringify(targetTags) : 'none'}`);
    console.log(`   ? Target owners: ${targetOwners ? JSON.stringify(targetOwners) : 'none'}`);
    console.log(`   ? Target subscription types: ${targetSubscriptionTypes ? JSON.stringify(targetSubscriptionTypes) : 'none'}`);
    
    let query = `
      SELECT DISTINCT u.id, u.name, u.email, u.tags, u.owner_id,
             s.subscription_type_id,
             CASE 
               WHEN s.subscription_type_id IS NULL THEN 'FREE Plex Access'
               ELSE st.name 
             END as subscription_name,
             o.name as owner_name, o.email as owner_email,
             u.bcc_owner_renewal
      FROM users u
      LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status = 'active'
      LEFT JOIN subscription_types st ON s.subscription_type_id = st.id
      LEFT JOIN owners o ON u.owner_id = o.id
      WHERE 1=1
    `;

    const params = [];

    if (excludeAutomated) {
      query += ` AND u.exclude_automated_emails = FALSE`;
    }

    const allUsers = await db.query(query, params);
    console.log(`   ? Found ${allUsers.length} users before filtering`);

    // Apply filtering (EXACT SAME LOGIC)
    let filteredUsers = allUsers;

    // Filter by tags
    if (targetTags && targetTags.length > 0) {
      filteredUsers = filteredUsers.filter(user => {
        const userTags = this.safeJsonParse(user.tags, []);
        return targetTags.some(tag => userTags.includes(tag));
      });
      console.log(`   ? After tag filtering: ${filteredUsers.length} users`);
    }

    // Filter by owners
    if (targetOwners && targetOwners.length > 0) {
      filteredUsers = filteredUsers.filter(user => {
        return targetOwners.includes(user.owner_id);
      });
      console.log(`   ? After owner filtering: ${filteredUsers.length} users`);
    }

    // Filter by subscription types
    if (targetSubscriptionTypes && targetSubscriptionTypes.length > 0) {
      filteredUsers = filteredUsers.filter(user => {
        // Handle both NULL (free) and specific subscription type IDs
        if (targetSubscriptionTypes.includes('free') && user.subscription_type_id === null) {
          return true;
        }
        return targetSubscriptionTypes.includes(user.subscription_type_id);
      });
      console.log(`   ? After subscription type filtering: ${filteredUsers.length} users`);
    }

    return filteredUsers;

  } catch (error) {
    console.error('? Error getting all target users:', error);
    return [];
  }
}
  
  async testConnection() {
    try {
      if (!this.transporter) {
        await this.initializeTransporter();
      }
      
      if (!this.transporter) {
        return { success: false, error: 'SMTP not configured' };
      }
      
      await this.transporter.verify();
      return { success: true, message: 'SMTP connection successful' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async testEmailConnection() {
    try {
      console.log('?? Testing email connection...');
      
      // Get SMTP settings from database
      const smtpSettings = await this.getEmailSettings();
      console.log('?? SMTP Settings:', { 
        host: smtpSettings.smtp_host, 
        port: smtpSettings.smtp_port, 
        user: smtpSettings.smtp_user,
        pass: smtpSettings.smtp_pass ? '[CONFIGURED]' : '[NOT SET]'
      });
      
      if (!smtpSettings.smtp_host || !smtpSettings.smtp_user || !smtpSettings.smtp_pass) {
        return { 
          success: false, 
          error: 'Email service not configured - missing SMTP settings' 
        };
      }

      // Test connection
      const connectionTest = await this.testConnection();
      if (!connectionTest.success) {
        return { 
          success: false, 
          error: `SMTP connection failed: ${connectionTest.error}` 
        };
      }

      // Send test email to the configured email address
      const testEmail = smtpSettings.smtp_user;
      const testSubject = 'JohnsonFlix Email Test';
      const testBody = `
        <h2 style="color: #8e24aa;">Email Test Successful!</h2>
        <p>This is a test email from your JohnsonFlix subscription manager.</p>
        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>SMTP Host:</strong> ${smtpSettings.smtp_host}</p>
        <p><strong>SMTP Port:</strong> ${smtpSettings.smtp_port}</p>
        <p>If you received this email, your email configuration is working correctly!</p>
      `;

      const result = await this.sendEmail(testEmail, testSubject, testBody, {
        templateName: 'Email Test'
      });

      if (result.success) {
        return { 
          success: true, 
          message: `Test email sent successfully to ${testEmail}` 
        };
      } else {
        return { 
          success: false, 
          error: `Failed to send test email: ${result.error}` 
        };
      }

    } catch (error) {
      console.error('? Email test error:', error);
      return { 
        success: false, 
        error: `Email test failed: ${error.message}` 
      };
    }
  }
  
  async reinitialize() {
  console.log('?? Reinitializing email service with new settings...');
  this.transporter = null;
  await this.initializeTransporter();
}

  async getSMTPSettings() {
    return await this.getEmailSettings();
  }

  async sendBulkEmail(tags, subject, body, options = {}) {
    try {
      console.log(`?? Starting bulk email to tags: ${tags.join(', ')}`);
      
      // Get target users
      let query = 'SELECT * FROM users WHERE 1=1';
      const params = [];

      if (options.excludeBulkOptOut !== false) {
        query += ' AND exclude_bulk_emails = FALSE';
      }

      const allUsers = await db.query(query, params);

      // Filter by tags if specified
      let targetUsers = allUsers;
      if (tags && tags.length > 0) {
        targetUsers = allUsers.filter(user => {
          if (!user.tags) return false;
          try {
            const userTags = JSON.parse(user.tags);
            return tags.some(tag => userTags.includes(tag));
          } catch (e) {
            return false;
          }
        });
      }

      console.log(`?? Found ${targetUsers.length} target users for bulk email`);

      // Send emails to all target users
      let sentCount = 0;
      let failedCount = 0;

      for (const user of targetUsers) {
        try {
          const personalizedBody = await this.replacePlaceholders(body, user);
          const personalizedSubject = await this.replacePlaceholders(subject, user);
          
          const result = await this.sendEmail(user.email, personalizedSubject, personalizedBody, {
            userId: user.id,
            templateName: options.templateName || 'Bulk Email',
            bcc: options.bcc || []
          });

          if (result.success) {
            sentCount++;
          } else {
            failedCount++;
          }
        } catch (error) {
          console.error(`Error sending bulk email to ${user.name}:`, error);
          failedCount++;
        }
      }

      console.log(`? Bulk email completed: ${sentCount} sent, ${failedCount} failed`);

      return {
        success: true,
        message: `Bulk email completed: ${sentCount} sent, ${failedCount} failed`,
        sent: sentCount,
        failed: failedCount,
        total: targetUsers.length
      };

    } catch (error) {
      console.error('Error sending bulk email:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new EmailService();