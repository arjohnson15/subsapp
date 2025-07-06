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
      // Get SMTP settings from database
      const smtpSettings = await this.getSMTPSettings();
      
      if (smtpSettings.smtp_host && smtpSettings.smtp_user && smtpSettings.smtp_pass) {
        this.transporter = nodemailer.createTransporter({
          host: smtpSettings.smtp_host,
          port: parseInt(smtpSettings.smtp_port) || 587,
          secure: parseInt(smtpSettings.smtp_port) === 465,
          auth: {
            user: smtpSettings.smtp_user,
            pass: smtpSettings.smtp_pass
          }
        });
        console.log('✅ Email service initialized with database settings');
      } else {
        console.log('⚠️ Email service not configured - missing SMTP settings');
      }
    } catch (error) {
      console.error('❌ Error initializing email service:', error);
    }
  }

  async getSMTPSettings() {
    try {
      const settings = await db.query(`
        SELECT setting_key, setting_value 
        FROM settings 
        WHERE setting_key IN ('smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'from_email', 'from_name')
      `);
      
      const smtpConfig = {};
      settings.forEach(setting => {
        smtpConfig[setting.setting_key] = setting.setting_value;
      });
      
      return smtpConfig;
    } catch (error) {
      console.error('Error fetching SMTP settings:', error);
      return {};
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

  async sendEmail(to, subject, htmlBody, options = {}) {
    try {
      if (!this.transporter) {
        await this.initializeTransporter();
      }
      
      if (!this.transporter) {
        throw new Error('Email service not configured');
      }

      const smtpSettings = await this.getSMTPSettings();
      
      const mailOptions = {
        from: `${smtpSettings.from_name || 'JohnsonFlix'} <${smtpSettings.from_email || smtpSettings.smtp_user}>`,
        to: to,
        subject: subject,
        html: htmlBody,
        bcc: options.bcc || []
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      // Log the email
      await this.logEmail(options.userId, to, subject, options.templateName, 'sent');
      
      return { success: true, messageId: result.messageId };
    } catch (error) {
      // Log the error
      await this.logEmail(options.userId, to, subject, options.templateName, 'failed', error.message);
      
      console.error('Error sending email:', error);
      return { success: false, error: error.message };
    }
  }

  async logEmail(userId, recipientEmail, subject, templateUsed, status, errorMessage = null) {
    try {
      await db.query(`
        INSERT INTO email_logs (user_id, recipient_email, subject, template_used, status, error_message)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [userId || null, recipientEmail, subject, templateUsed || null, status, errorMessage]);
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
      
      // Get all settings for dynamic replacement
      const settings = await db.query('SELECT setting_key, setting_value FROM settings');
      const settingsMap = {};
      settings.forEach(setting => {
        settingsMap[setting.setting_key] = setting.setting_value;
      });

      // Replace user-specific placeholders
      const placeholders = {
        name: userData.name || '',
        email: userData.email || '',
        plex_email: userData.plex_email || '',
        iptv_username: userData.iptv_username || '',
        iptv_password: userData.iptv_password || '',
        implayer_code: userData.implayer_code || '',
        device_count: userData.device_count || '',
        owner_name: userData.owner_name || '',
        owner_email: userData.owner_email || '',
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
      console.log('Starting renewal reminder process...');

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

      console.log(`Sent ${sevenDayUsers.length} 7-day reminders and ${twoDayUsers.length} 2-day reminders`);
      return { success: true, sent: sevenDayUsers.length + twoDayUsers.length };
    } catch (error) {
      console.error('Error sending renewal reminders:', error);
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
      const now = new Date();
      let shouldRun = false;
      let targetUsers = [];

      if (schedule.schedule_type === 'expiration_reminder') {
        // Check daily for expiration reminders
        targetUsers = await this.getExpiringUsers(
          schedule.days_before_expiration,
          schedule.subscription_type,
          schedule.target_tags ? JSON.parse(schedule.target_tags) : null,
          schedule.exclude_users_with_setting
        );
        
        shouldRun = targetUsers.length > 0;
        
      } else if (schedule.schedule_type === 'specific_date') {
        if (schedule.next_run) {
          const nextRun = new Date(schedule.next_run);
          shouldRun = now >= nextRun;
          
          if (shouldRun) {
            targetUsers = await this.getAllTargetUsers(
              schedule.target_tags ? JSON.parse(schedule.target_tags) : null,
              schedule.exclude_users_with_setting
            );
          }
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
            console.error(`Error sending to ${user.name}:`, error);
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
      }
    } catch (error) {
      console.error(`❌ Error processing schedule ${schedule.name}:`, error);
    }
  }

  async getExpiringUsers(daysBefore, subscriptionType, targetTags, excludeAutomated) {
    try {
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

      // Filter by tags if specified
      if (targetTags && targetTags.length > 0) {
        return users.filter(user => {
          if (!user.tags) return false;
          const userTags = JSON.parse(user.tags);
          return targetTags.some(tag => userTags.includes(tag));
        });
      }

      return users;
    } catch (error) {
      console.error('Error getting expiring users:', error);
      return [];
    }
  }

  async getAllTargetUsers(targetTags, excludeAutomated) {
    try {
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

      // Filter by tags if specified
      if (targetTags && targetTags.length > 0) {
        return users.filter(user => {
          if (!user.tags) return false;
          const userTags = JSON.parse(user.tags);
          return targetTags.some(tag => userTags.includes(tag));
        });
      }

      return users;
    } catch (error) {
      console.error('Error getting target users:', error);
      return [];
    }
  }

  async sendBulkEmail(tags, subject, htmlBody, options = {}) {
    try {
      const whereClause = tags.map(() => 'JSON_CONTAINS(tags, ?)').join(' OR ');
      const tagParams = tags.map(tag => JSON.stringify(tag));
      
      const users = await db.query(`
        SELECT u.*, o.email as owner_email 
        FROM users u 
        LEFT JOIN owners o ON u.owner_id = o.id
        WHERE u.exclude_bulk_emails = FALSE AND (${whereClause})
      `, tagParams);

      let sentCount = 0;
      let errors = [];

      for (const user of users) {
        try {
          const personalizedBody = await this.processTemplate(htmlBody, user);
          const personalizedSubject = await this.processTemplate(subject, user);
          
          const result = await this.sendEmail(user.email, personalizedSubject, personalizedBody, {
            userId: user.id,
            templateName: options.templateName,
            bcc: options.bcc
          });

          if (result.success) {
            sentCount++;
          } else {
            errors.push(`${user.name}: ${result.error}`);
          }
        } catch (error) {
          errors.push(`${user.name}: ${error.message}`);
        }
      }

      return {
        success: true,
        sent: sentCount,
        total: users.length,
        errors: errors
      };
    } catch (error) {
      console.error('Error sending bulk email:', error);
      return { success: false, error: error.message };
    }
  }
}

// Create and export singleton instance
const emailService = new EmailService();
module.exports = emailService;