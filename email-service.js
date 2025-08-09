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
      console.log('✅ Email service initialized successfully');
    } catch (error) {
      console.error('❌ Email service initialization failed:', error.message);
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
        console.error('❌ Email transporter not initialized');
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

      console.log('📧 Sending email with options:', {
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

      console.log(`✅ Email sent to ${to}: ${subject}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error(`❌ Failed to send email to ${to}:`, error.message);
      
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
    console.log('📧 Processing scheduled emails...');
    
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

    console.log(`📧 Found ${schedules.length} active specific date schedules`);

    for (const schedule of schedules) {
      await this.processIndividualSchedule(schedule);
    }

    console.log('✅ Finished processing specific date emails');
  } catch (error) {
    console.error('❌ Error processing scheduled emails:', error);
  }
}

async processExpirationReminders() {
  try {
    console.log('📧 Processing expiration reminder schedules...');
    
    // ONLY process expiration_reminder emails in daily runs
    const schedules = await db.query(`
      SELECT es.*, et.subject, et.body, et.name as template_name
      FROM email_schedules es
      LEFT JOIN email_templates et ON es.email_template_id = et.id
      WHERE es.active = TRUE 
        AND es.schedule_type = 'expiration_reminder'
      ORDER BY es.id
    `);

    console.log(`📧 Found ${schedules.length} active expiration reminder schedules`);

    for (const schedule of schedules) {
      await this.processIndividualSchedule(schedule);
    }

    console.log('✅ Finished processing expiration reminder emails');
  } catch (error) {
    console.error('❌ Error processing expiration reminder emails:', error);
  }
}

async processIndividualSchedule(schedule) {
  try {
    console.log(`🔍 Processing schedule: ${schedule.name} (ID: ${schedule.id})`);
    
    const now = new Date();
    let shouldRun = false;
    let targetUsers = [];

    // Helper function to safely parse JSON fields
    const parseTargetData = (targetData) => {
      if (!targetData) return null;
      try {
        return JSON.parse(targetData);
      } catch (e) {
        console.log(`⚠️ Invalid JSON for schedule ${schedule.id}:`, targetData);
        return null;
      }
    };

    if (schedule.schedule_type === 'expiration_reminder') {
      console.log(`   → Expiration reminder: ${schedule.days_before_expiration} days before, type: ${schedule.subscription_type}`);
      
      targetUsers = await this.getExpiringUsers(
        schedule.days_before_expiration,
        schedule.subscription_type,
        parseTargetData(schedule.target_tags),
        parseTargetData(schedule.target_owners),           // NEW
        parseTargetData(schedule.target_subscription_types), // NEW
        schedule.exclude_users_with_setting
      );
      
      shouldRun = targetUsers.length > 0;
      console.log(`   → Found ${targetUsers.length} expiring users`);
      
    } else if (schedule.schedule_type === 'specific_date') {
      console.log(`   → Specific date schedule: ${schedule.next_run}`);
      
      if (schedule.next_run) {
        const nextRun = new Date(schedule.next_run);
        shouldRun = now >= nextRun;
        console.log(`   → Should run? ${shouldRun} (now: ${now.toISOString()}, scheduled: ${nextRun.toISOString()})`);
        
        if (shouldRun) {
          targetUsers = await this.getAllTargetUsers(
            parseTargetData(schedule.target_tags),
            parseTargetData(schedule.target_owners),           // NEW
            parseTargetData(schedule.target_subscription_types), // NEW
            schedule.exclude_users_with_setting
          );
          console.log(`   → Found ${targetUsers.length} target users`);
        }
      } else {
        console.log(`   → No next_run date set, skipping`);
      }
    }

    if (shouldRun && targetUsers.length > 0) {
      console.log(`📤 Running schedule: ${schedule.name} for ${targetUsers.length} users`);
      let sentCount = 0;
      
      if (schedule.schedule_type === 'specific_date') {
        // FIXED: For specific date emails, send ONE email with all users as BCC (NO OWNER BCC)
        try {
          // Get sender email from settings
          const emailSettings = await this.getEmailSettings();
          const senderEmail = emailSettings.smtp_user;
          
          if (!senderEmail) {
            console.error('❌ No sender email configured in settings');
            return;
          }
          
          // Use first user's data for template personalization
          const templateUser = targetUsers[0];
          const personalizedBody = await this.replacePlaceholders(schedule.body, templateUser);
          const personalizedSubject = await this.replacePlaceholders(schedule.subject, templateUser);
          
          // Collect ONLY user emails for BCC (NO OWNER EMAILS)
          const allUserEmails = targetUsers.map(user => user.email);
          
          console.log(`   → Sending single specific date email with ${allUserEmails.length} users in BCC`);
          console.log(`   → NO owner BCCs for scheduled emails`);
          
          const emailOptions = {
            templateName: schedule.template_name,
            bcc: allUserEmails
          };
          
          // Send ONE email TO the sender, with all users in BCC
          const result = await this.sendEmail(senderEmail, personalizedSubject, personalizedBody, emailOptions);
          
          if (result.success) {
            sentCount = allUserEmails.length;
            console.log(`✅ Specific date email sent to ${allUserEmails.length} users via BCC`);
            
            // Log email for each user
            for (const user of targetUsers) {
              await this.logEmail(user.id, user.email, personalizedSubject, schedule.template_name, 'sent');
            }
          }
          
        } catch (error) {
          console.error(`❌ Error sending specific date email:`, error);
        }
        
      } else if (schedule.schedule_type === 'expiration_reminder') {
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
              console.log(`   → Adding owner BCC: ${user.owner_email} for user ${user.name}`);
            }
            
            const result = await this.sendEmail(user.email, personalizedSubject, personalizedBody, emailOptions);

            if (result.success) {
              sentCount++;
            }
          } catch (error) {
            console.error(`   ❌ Error sending to ${user.name}:`, error);
          }
        }
        console.log(`✅ Expiration reminder emails: ${sentCount}/${targetUsers.length} sent individually`);
      }

      // Update schedule statistics
      await db.query(`
        UPDATE email_schedules 
        SET last_run = ?, run_count = COALESCE(run_count, 0) + 1,
            active = ${schedule.schedule_type === 'specific_date' ? 'FALSE' : 'TRUE'}
        WHERE id = ?
      `, [now, schedule.id]);

      console.log(`✅ Schedule "${schedule.name}" completed: ${sentCount}/${targetUsers.length} emails sent`);
    } else {
      console.log(`   → Skipping schedule (shouldRun: ${shouldRun}, targetUsers: ${targetUsers.length})`);
    }
  } catch (error) {
    console.error(`❌ Error processing schedule ${schedule.name}:`, error);
  }
}

async getExpiringUsers(daysBefore, subscriptionType, targetTags = null, targetOwners = null, targetSubscriptionTypes = null, excludeWithSetting = true) {
  console.log(`🔍 Finding users expiring in ${daysBefore} days (type: ${subscriptionType})`);
  console.log(`   → Target tags: ${targetTags ? JSON.stringify(targetTags) : 'none'}`);
  console.log(`   → Target owners: ${targetOwners ? JSON.stringify(targetOwners) : 'none'}`);
  console.log(`   → Target subscription types: ${targetSubscriptionTypes ? JSON.stringify(targetSubscriptionTypes) : 'none'}`);
  
  try {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysBefore);
    const targetDateStr = targetDate.toISOString().split('T')[0];

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
             o.name as owner_name
      FROM users u
      LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status = 'active'
      LEFT JOIN subscription_types st ON s.subscription_type_id = st.id
      LEFT JOIN owners o ON u.owner_id = o.id
      WHERE 1=1
    `;
    
    const params = [];
    
    // Date filtering
    if (subscriptionType === 'plex') {
      query += ` AND st.type = 'plex' AND DATE(s.expiration_date) = ?`;
      params.push(targetDateStr);
    } else if (subscriptionType === 'iptv') {
      query += ` AND st.type = 'iptv' AND DATE(s.expiration_date) = ?`;
      params.push(targetDateStr);
    } else if (subscriptionType === 'both') {
      query += ` AND st.type IN ('plex', 'iptv') AND DATE(s.expiration_date) = ?`;
      params.push(targetDateStr);
    }
    
    // Exclude users with setting
    if (excludeWithSetting) {
      query += ` AND u.exclude_automated_emails = FALSE`;
    }
    
    const allUsers = await db.query(query, params);
    console.log(`   → Found ${allUsers.length} users matching date criteria`);
    
    // Apply additional filtering
    let filteredUsers = allUsers;
    
    // Filter by tags
    if (targetTags && targetTags.length > 0) {
      filteredUsers = filteredUsers.filter(user => {
        const userTags = this.safeJsonParse(user.tags, []);
        return targetTags.some(tag => userTags.includes(tag));
      });
      console.log(`   → After tag filtering: ${filteredUsers.length} users`);
    }
    
    // NEW: Filter by owners
    if (targetOwners && targetOwners.length > 0) {
      filteredUsers = filteredUsers.filter(user => {
        return targetOwners.includes(user.owner_id);
      });
      console.log(`   → After owner filtering: ${filteredUsers.length} users`);
    }
    
    // NEW: Filter by subscription types
    if (targetSubscriptionTypes && targetSubscriptionTypes.length > 0) {
      filteredUsers = filteredUsers.filter(user => {
        // Handle both NULL (free) and specific subscription type IDs
        if (targetSubscriptionTypes.includes('free') && user.subscription_type_id === null) {
          return true;
        }
        return targetSubscriptionTypes.includes(user.subscription_type_id);
      });
      console.log(`   → After subscription type filtering: ${filteredUsers.length} users`);
    }
    
    return filteredUsers;
    
  } catch (error) {
    console.error('❌ Error finding expiring users:', error);
    return [];
  }
}

async getAllUsersWithSubscriptionType(subscriptionType, targetTags = null, targetOwners = null, targetSubscriptionTypes = null, excludeWithSetting = true) {
  console.log(`🔍 Getting ALL users with subscription type: ${subscriptionType} (ignoring expiration dates)`);
  console.log(`   → Target tags: ${targetTags ? JSON.stringify(targetTags) : 'none'}`);
  console.log(`   → Target owners: ${targetOwners ? JSON.stringify(targetOwners) : 'none'}`);
  console.log(`   → Target subscription types: ${targetSubscriptionTypes ? JSON.stringify(targetSubscriptionTypes) : 'none'}`);
  
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
    console.log(`   → Found ${allUsers.length} users with ${subscriptionType} subscriptions`);
    
    // Apply additional filtering (EXACT SAME LOGIC as getExpiringUsers)
    let filteredUsers = allUsers;
    
    // Filter by tags
    if (targetTags && targetTags.length > 0) {
      filteredUsers = filteredUsers.filter(user => {
        const userTags = this.safeJsonParse(user.tags, []);
        return targetTags.some(tag => userTags.includes(tag));
      });
      console.log(`   → After tag filtering: ${filteredUsers.length} users`);
    }
    
    // Filter by owners
    if (targetOwners && targetOwners.length > 0) {
      filteredUsers = filteredUsers.filter(user => {
        return targetOwners.includes(user.owner_id);
      });
      console.log(`   → After owner filtering: ${filteredUsers.length} users`);
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
      console.log(`   → After subscription type filtering: ${filteredUsers.length} users`);
    }
    
    return filteredUsers;
    
  } catch (error) {
    console.error('❌ Error finding users with subscription type:', error);
    return [];
  }
}

  async getAllTargetUsers(targetTags = null, targetOwners = null, targetSubscriptionTypes = null, excludeAutomated = true) {
  try {
    console.log(`   🔍 Getting all target users, excludeAutomated: ${excludeAutomated}`);
    console.log(`   → Target tags: ${targetTags ? JSON.stringify(targetTags) : 'none'}`);
    console.log(`   → Target owners: ${targetOwners ? JSON.stringify(targetOwners) : 'none'}`);
    console.log(`   → Target subscription types: ${targetSubscriptionTypes ? JSON.stringify(targetSubscriptionTypes) : 'none'}`);
    
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
    console.log(`   → Found ${allUsers.length} users before filtering`);

    // Apply filtering (EXACT SAME LOGIC)
    let filteredUsers = allUsers;

    // Filter by tags
    if (targetTags && targetTags.length > 0) {
      filteredUsers = filteredUsers.filter(user => {
        const userTags = this.safeJsonParse(user.tags, []);
        return targetTags.some(tag => userTags.includes(tag));
      });
      console.log(`   → After tag filtering: ${filteredUsers.length} users`);
    }

    // Filter by owners
    if (targetOwners && targetOwners.length > 0) {
      filteredUsers = filteredUsers.filter(user => {
        return targetOwners.includes(user.owner_id);
      });
      console.log(`   → After owner filtering: ${filteredUsers.length} users`);
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
      console.log(`   → After subscription type filtering: ${filteredUsers.length} users`);
    }

    return filteredUsers;

  } catch (error) {
    console.error('❌ Error getting all target users:', error);
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
      console.log('🧪 Testing email connection...');
      
      // Get SMTP settings from database
      const smtpSettings = await this.getEmailSettings();
      console.log('📧 SMTP Settings:', { 
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
      console.error('❌ Email test error:', error);
      return { 
        success: false, 
        error: `Email test failed: ${error.message}` 
      };
    }
  }
  
  async reinitialize() {
  console.log('🔄 Reinitializing email service with new settings...');
  this.transporter = null;
  await this.initializeTransporter();
}

  async getSMTPSettings() {
    return await this.getEmailSettings();
  }

  async sendBulkEmail(tags, subject, body, options = {}) {
    try {
      console.log(`📧 Starting bulk email to tags: ${tags.join(', ')}`);
      
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

      console.log(`📧 Found ${targetUsers.length} target users for bulk email`);

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

      console.log(`✅ Bulk email completed: ${sentCount} sent, ${failedCount} failed`);

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