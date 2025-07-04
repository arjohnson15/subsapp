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
      
      this.transporter = nodemailer.createTransport({
        host: settings.smtp_host || process.env.SMTP_HOST,
        port: parseInt(settings.smtp_port) || parseInt(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: {
          user: settings.smtp_user || process.env.SMTP_USER,
          pass: settings.smtp_pass || process.env.SMTP_PASS
        }
      });

      console.log('Email transporter initialized');
    } catch (error) {
      console.error('Failed to initialize email transporter:', error);
    }
  }

  async getEmailSettings() {
    try {
      const settings = await db.query(`
        SELECT setting_key, setting_value 
        FROM settings 
        WHERE setting_key IN ('smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'from_name', 'paypal_link', 'venmo_link', 'cashapp_link')
      `);
      
      const settingsObj = {};
      settings.forEach(setting => {
        settingsObj[setting.setting_key] = setting.setting_value;
      });
      
      return settingsObj;
    } catch (error) {
      console.error('Error fetching email settings:', error);
      return {};
    }
  }

  async sendEmail(to, subject, htmlBody, options = {}) {
    try {
      if (!this.transporter) {
        await this.initializeTransporter();
      }

      const settings = await this.getEmailSettings();
      const fromName = settings.from_name || 'JohnsonFlix';
      const fromEmail = settings.smtp_user || process.env.SMTP_USER;

      const mailOptions = {
        from: `"${fromName}" <${fromEmail}>`,
        to: to,
        subject: subject,
        html: htmlBody,
        cc: options.cc || [],
        bcc: options.bcc || []
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      // Log email
      await this.logEmail(options.userId, to, subject, options.templateName, 'sent');
      
      console.log('Email sent successfully:', result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('Email send error:', error);
      
      // Log failed email
      await this.logEmail(options.userId, to, subject, options.templateName, 'failed', error.message);
      
      return { success: false, error: error.message };
    }
  }

  async logEmail(userId, recipient, subject, template, status, errorMessage = null) {
    try {
      await db.query(`
        INSERT INTO email_logs (user_id, recipient_email, subject, template_used, status, error_message)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [userId || null, recipient, subject, template || null, status, errorMessage]);
    } catch (error) {
      console.error('Error logging email:', error);
    }
  }

  async getTemplate(templateName) {
    try {
      const [template] = await db.query('SELECT * FROM email_templates WHERE name = ?', [templateName]);
      return template;
    } catch (error) {
      console.error('Error fetching template:', error);
      return null;
    }
  }

async processTemplate(templateBody, userData) {
    try {
      const settings = await this.getEmailSettings();
      
      // Calculate plex-specific days until expiration - FIXED
      let plexDaysUntilExpiration = '';
      if (userData.plex_expiration) {
        // FIXED: Check for FREE more broadly and add debug logging
        console.log('🔍 Processing Plex expiration:', userData.plex_expiration, typeof userData.plex_expiration);
        
        if (userData.plex_expiration === 'FREE' || 
            userData.plex_expiration === 'No Subscription' ||
            userData.plex_expiration === null ||
            userData.plex_expiration === 'free') {
          plexDaysUntilExpiration = 'N/A (Free Access)';
        } else {
          try {
            const expirationDate = new Date(userData.plex_expiration);
            // Check if it's a valid date
            if (isNaN(expirationDate.getTime())) {
              console.log('⚠️ Invalid Plex expiration date:', userData.plex_expiration);
              plexDaysUntilExpiration = 'Invalid Date';
            } else {
              const today = new Date();
              today.setHours(0, 0, 0, 0); // Reset time to start of day
              expirationDate.setHours(0, 0, 0, 0); // Reset time to start of day
              
              const timeDiff = expirationDate.getTime() - today.getTime();
              const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
              plexDaysUntilExpiration = daysDiff > 0 ? daysDiff.toString() : '0';
              
              console.log('📅 Calculated Plex days:', daysDiff, 'for expiration:', userData.plex_expiration);
            }
          } catch (error) {
            console.error('❌ Error calculating Plex days:', error);
            plexDaysUntilExpiration = 'Invalid Date';
          }
        }
      } else {
        plexDaysUntilExpiration = 'No Plex Access';
      }

      // Calculate iptv-specific days until expiration
      let iptvDaysUntilExpiration = '';
      if (userData.iptv_expiration) {
        if (userData.iptv_expiration === 'FREE' || userData.iptv_expiration === 'No Subscription') {
          iptvDaysUntilExpiration = 'N/A (Free Access)';
        } else {
          try {
            const expirationDate = new Date(userData.iptv_expiration);
            const today = new Date();
            const timeDiff = expirationDate.getTime() - today.getTime();
            const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
            iptvDaysUntilExpiration = daysDiff > 0 ? daysDiff.toString() : '0';
          } catch (error) {
            iptvDaysUntilExpiration = 'Invalid Date';
          }
        }
      } else {
        iptvDaysUntilExpiration = 'No IPTV Access';
      }
      
      console.log('📧 Final template values:', {
        plexExpiration: userData.plex_expiration,
        plexDays: plexDaysUntilExpiration,
        iptvExpiration: userData.iptv_expiration, 
        iptvDays: iptvDaysUntilExpiration
      });
      
      let processedBody = templateBody
        .replace(/\{\{name\}\}/g, userData.name || '')
        .replace(/\{\{email\}\}/g, userData.email || '')
        .replace(/\{\{username\}\}/g, userData.plex_email || userData.iptv_username || '')
        .replace(/\{\{plex_email\}\}/g, userData.plex_email || '')
        .replace(/\{\{iptv_username\}\}/g, userData.iptv_username || '')
        .replace(/\{\{iptv_password\}\}/g, userData.iptv_password || '')
        .replace(/\{\{implayer_code\}\}/g, userData.implayer_code || '')
        .replace(/\{\{device_count\}\}/g, userData.device_count || '')
        .replace(/\{\{owner_name\}\}/g, userData.owner_name || '')
        .replace(/\{\{owner_email\}\}/g, userData.owner_email || '')
        .replace(/\{\{plex_expiration\}\}/g, userData.plex_expiration || '')
        .replace(/\{\{iptv_expiration\}\}/g, userData.iptv_expiration || '')
        .replace(/\{\{expiration_date\}\}/g, userData.expiration_date || userData.plex_expiration || userData.iptv_expiration || '')
        .replace(/\{\{subscription_type\}\}/g, userData.subscription_type || '')
        .replace(/\{\{days_until_expiration\}\}/g, userData.days_until_expiration || '')
        // NEW: Add specific Plex and IPTV days until expiration
        .replace(/\{\{plex_days_until_expiration\}\}/g, plexDaysUntilExpiration)
        .replace(/\{\{iptv_days_until_expiration\}\}/g, iptvDaysUntilExpiration)
        .replace(/\{\{renewal_price\}\}/g, userData.renewal_price || '')
        .replace(/\{\{paypal_link\}\}/g, settings.paypal_link || '')
        .replace(/\{\{venmo_link\}\}/g, settings.venmo_link || '')
        .replace(/\{\{cashapp_link\}\}/g, settings.cashapp_link || '');
      
      return processedBody;
    } catch (error) {
      console.error('Error processing template:', error);
      return templateBody;
    }
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
          AND s.is_free = FALSE
          AND s.expiration_date = DATE_ADD(CURDATE(), INTERVAL 7 DAY)
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
          AND s.is_free = FALSE
          AND s.expiration_date = DATE_ADD(CURDATE(), INTERVAL 2 DAY)
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
  
  // ADD this method to your existing EmailService class
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
    // Process each schedule based on its type
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
        for (const user of targetUsers) {
            try {
                const personalizedBody = await this.replacePlaceholders(schedule.body, user);
                const personalizedSubject = await this.replacePlaceholders(schedule.subject, user);
                
                await this.sendEmail(user.email, personalizedSubject, personalizedBody, {
                    userId: user.id,
                    templateName: schedule.template_name
                });
            } catch (error) {
                console.error(`Error sending to ${user.name}:`, error);
            }
        }

        // Update schedule statistics
        await db.query(`
            UPDATE email_schedules 
            SET last_run = ?, run_count = run_count + 1,
                active = ${schedule.schedule_type === 'specific_date' ? 'FALSE' : 'TRUE'}
            WHERE id = ?
        `, [now, schedule.id]);
    }
}
  
async sendBulkEmail(tags, subject, htmlBody, options = {}) {
  try {
    const whereClause = tags.map(() => 'JSON_CONTAINS(tags, ?)').join(' OR ');
    const tagParams = tags.map(tag => JSON.stringify(tag));
    
    const users = await db.query(`
      SELECT u.*, o.name as owner_name, o.email as owner_email
      FROM users u
      LEFT JOIN owners o ON u.owner_id = o.id
      WHERE (${whereClause}) AND exclude_bulk_emails = FALSE
    `, tagParams);

    if (users.length === 0) {
      return { success: true, sent: 0, message: 'No users found with selected tags' };
    }

    // Collect all user emails for BCC
    const userEmails = users.map(user => user.email);
    
    // Collect unique owner emails for BCC (if they want to be notified)
    const ownerEmails = [...new Set(
      users
        .filter(user => user.bcc_owner_renewal && user.owner_email)
        .map(user => user.owner_email)
    )];

    // Combine all BCC recipients
    const allBccEmails = [...userEmails, ...ownerEmails, ...(options.bcc || [])];

    // Get settings for "from" email
    const settings = await this.getEmailSettings();
    const fromEmail = settings.smtp_user || process.env.SMTP_USER;

    // Send ONE email with everyone BCC'd
    const result = await this.sendEmail(
      fromEmail, // Send to yourself as the main recipient
      subject,
      htmlBody,
      {
        bcc: allBccEmails,
        templateName: options.templateName
      }
    );

    if (result.success) {
      return { 
        success: true, 
        sent: userEmails.length, 
        message: `Bulk email sent to ${userEmails.length} users via BCC` 
      };
    } else {
      return { success: false, error: result.error };
    }

  } catch (error) {
    console.error('Bulk email error:', error);
    return { success: false, error: error.message };
  }
}

  async testEmailConnection() {
    try {
      if (!this.transporter) {
        await this.initializeTransporter();
      }
      
      await this.transporter.verify();
      return { success: true, message: 'Email connection successful' };
    } catch (error) {
      console.error('Email connection test failed:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new EmailService();