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

      this.transporter = nodemailer.createTransporter({
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
        html: htmlBody,
        bcc: options.bcc || []
      };

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
        INSERT INTO email_logs (user_id, email, subject, template_used, status, error_message)
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
        name: userData.name || '',
        email: userData.email || '',
        plex_email: userData.plex_email || userData.email || '',
        iptv_username: userData.iptv_username || '',
        iptv_password: userData.iptv_password || '',
        implayer_code: userData.implayer_code || '',
        subscription_name: userData.subscription_name || '',
        subscription_type: userData.subscription_type || '',
        expiration_date: userData.expiration_date || '',
        plex_expiration: userData.plex_expiration || userData.expiration_date || '',
        iptv_expiration: userData.iptv_expiration || userData.expiration_date || '',
        days_until_expiration: userData.days_until_expiration || '',
        renewal_price: userData.renewal_price || '',
        // Add settings-based placeholders
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

  async sendRenewalReminders() {
    try {
      console.log('🔄 Starting renewal reminder process...');

      // Get users expiring in 7 days
      const sevenDayUsers = await db.query(`
        SELECT 
          u.*, 
          s.expiration_date,
          st.name as subscription_name,
          st.type as subscription_type,
          st.price as renewal_price,
          o.name as owner_name,
          o.email as owner_email,
          DATEDIFF(s.expiration_date, CURDATE()) as days_until_expiration
        FROM users u
        JOIN subscriptions s ON u.id = s.user_id
        JOIN subscription_types st ON s.subscription_type_id = st.id
        LEFT JOIN owners o ON u.owner_id = o.id
        WHERE s.status = 'active' 
          AND s.subscription_type_id IS NOT NULL
          AND s.expiration_date = DATE_ADD(CURDATE(), INTERVAL 7 DAY)
          AND u.exclude_automated_emails = FALSE
      `);

      // Get users expiring in 2 days
      const twoDayUsers = await db.query(`
        SELECT 
          u.*, 
          s.expiration_date,
          st.name as subscription_name,
          st.type as subscription_type,
          st.price as renewal_price,
          o.name as owner_name,
          o.email as owner_email,
          DATEDIFF(s.expiration_date, CURDATE()) as days_until_expiration
        FROM users u
        JOIN subscriptions s ON u.id = s.user_id
        JOIN subscription_types st ON s.subscription_type_id = st.id
        LEFT JOIN owners o ON u.owner_id = o.id
        WHERE s.status = 'active' 
          AND s.subscription_type_id IS NOT NULL
          AND s.expiration_date = DATE_ADD(CURDATE(), INTERVAL 2 DAY)
          AND u.exclude_automated_emails = FALSE
      `);

      console.log(`📧 Found ${sevenDayUsers.length} users expiring in 7 days, ${twoDayUsers.length} users expiring in 2 days`);

      // Send 7-day reminders
      for (const user of sevenDayUsers) {
        const userData = {
          ...user,
          plex_expiration: user.subscription_type === 'plex' ? user.expiration_date : '',
          iptv_expiration: user.subscription_type === 'iptv' ? user.expiration_date : '',
          renewal_price: `$${user.renewal_price}`
        };

        await this.sendTemplateEmail(user.id, '7-Day Renewal Reminder', userData, {
          bcc: user.bcc_owner_renewal && user.owner_email ? [user.owner_email] : []
        });
      }

      // Send 2-day reminders
      for (const user of twoDayUsers) {
        const userData = {
          ...user,
          plex_expiration: user.subscription_type === 'plex' ? user.expiration_date : '',
          iptv_expiration: user.subscription_type === 'iptv' ? user.expiration_date : '',
          renewal_price: `$${user.renewal_price}`
        };

        await this.sendTemplateEmail(user.id, '2-Day Renewal Reminder', userData, {
          bcc: user.bcc_owner_renewal && user.owner_email ? [user.owner_email] : []
        });
      }

      console.log(`✅ Sent ${sevenDayUsers.length} 7-day reminders and ${twoDayUsers.length} 2-day reminders`);
      return { success: true, sent: sevenDayUsers.length + twoDayUsers.length };
    } catch (error) {
      console.error('❌ Error sending renewal reminders:', error);
      return { success: false, error: error.message };
    }
  }
  
  // ===== AUTOMATED EMAIL SCHEDULER METHODS =====
  
  async processScheduledEmails() {
    try {
      console.log('🔄 Processing scheduled emails...');
      
      const schedules = await db.query(`
        SELECT es.*, et.subject, et.body, et.name as template_name
        FROM email_schedules es
        LEFT JOIN email_templates et ON es.email_template_id = et.id
        WHERE es.active = TRUE
        ORDER BY es.id
      `);

      console.log(`📧 Found ${schedules.length} active email schedules`);

      for (const schedule of schedules) {
        await this.processIndividualSchedule(schedule);
      }

      console.log('✅ Finished processing scheduled emails');
    } catch (error) {
      console.error('❌ Error processing scheduled emails:', error);
    }
  }

  async processIndividualSchedule(schedule) {
    try {
      console.log(`🔍 Processing schedule: ${schedule.name} (ID: ${schedule.id})`);
      
      const now = new Date();
      let shouldRun = false;
      let targetUsers = [];

      if (schedule.schedule_type === 'expiration_reminder') {
        console.log(`   → Expiration reminder: ${schedule.days_before_expiration} days before, type: ${schedule.subscription_type}`);
        
        targetUsers = await this.getExpiringUsers(
          schedule.days_before_expiration,
          schedule.subscription_type,
          schedule.target_tags ? JSON.parse(schedule.target_tags) : null,
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
              schedule.target_tags ? JSON.parse(schedule.target_tags) : null,
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
        
        // Send emails to all target users
        let sentCount = 0;
        for (const user of targetUsers) {
          try {
            const personalizedBody = await this.replacePlaceholders(schedule.body, user);
            const personalizedSubject = await this.replacePlaceholders(schedule.subject, user);
            
            const result = await this.sendEmail(user.email, personalizedSubject, personalizedBody, {
              userId: user.id,
              templateName: schedule.template_name
            });

            if (result.success) {
              sentCount++;
            }
          } catch (error) {
            console.error(`   ❌ Error sending to ${user.name}:`, error);
          }
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

  async getExpiringUsers(daysBefore, subscriptionType, targetTags, excludeAutomated) {
    try {
      console.log(`   🔍 Getting expiring users: ${daysBefore} days, type: ${subscriptionType}, excludeAutomated: ${excludeAutomated}`);
      
      let query = `
        SELECT 
          u.*, 
          s.expiration_date,
          st.name as subscription_name,
          st.type as subscription_type,
          st.price as renewal_price,
          o.name as owner_name,
          o.email as owner_email,
          DATEDIFF(s.expiration_date, CURDATE()) as days_until_expiration
        FROM users u
        JOIN subscriptions s ON u.id = s.user_id
        JOIN subscription_types st ON s.subscription_type_id = st.id
        LEFT JOIN owners o ON u.owner_id = o.id
        WHERE s.status = 'active' 
          AND s.subscription_type_id IS NOT NULL
          AND s.expiration_date = DATE_ADD(CURDATE(), INTERVAL ? DAY)
      `;

      const params = [daysBefore];

      // Add subscription type filter
      if (subscriptionType && subscriptionType !== 'both') {
        query += ' AND st.type = ?';
        params.push(subscriptionType);
      }

      // Add automated email exclusion filter
      if (excludeAutomated) {
        query += ' AND u.exclude_automated_emails = FALSE';
      }

      const users = await db.query(query, params);
      console.log(`   📊 Database returned ${users.length} users before tag filtering`);

      // Filter by tags if specified
      if (targetTags && targetTags.length > 0) {
        const filteredUsers = users.filter(user => {
          if (!user.tags) return false;
          try {
            const userTags = JSON.parse(user.tags);
            return targetTags.some(tag => userTags.includes(tag));
          } catch (e) {
            return false;
          }
        });
        console.log(`   🏷️ After tag filtering: ${filteredUsers.length} users`);
        return filteredUsers;
      }

      return users;
    } catch (error) {
      console.error('❌ Error getting expiring users:', error);
      return [];
    }
  }

  async getAllTargetUsers(targetTags, excludeAutomated) {
    try {
      console.log(`   🔍 Getting all target users, excludeAutomated: ${excludeAutomated}`);
      
      let query = `
        SELECT 
          u.*, 
          o.name as owner_name, 
          o.email as owner_email
        FROM users u
        LEFT JOIN owners o ON u.owner_id = o.id
        WHERE 1=1
      `;

      const params = [];

      // Add automated email exclusion filter
      if (excludeAutomated) {
        query += ' AND u.exclude_automated_emails = FALSE';
      }

      const users = await db.query(query, params);
      console.log(`   📊 Database returned ${users.length} users before tag filtering`);

      // Filter by tags if specified
      if (targetTags && targetTags.length > 0) {
        const filteredUsers = users.filter(user => {
          if (!user.tags) return false;
          try {
            const userTags = JSON.parse(user.tags);
            return targetTags.some(tag => userTags.includes(tag));
          } catch (e) {
            return false;
          }
        });
        console.log(`   🏷️ After tag filtering: ${filteredUsers.length} users`);
        return filteredUsers;
      }

      return users;
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