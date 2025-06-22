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
      
      this.transporter = nodemailer.createTransporter({
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
      
      let processedBody = templateBody
        .replace(/\{\{name\}\}/g, userData.name || '')
        .replace(/\{\{email\}\}/g, userData.email || '')
        .replace(/\{\{username\}\}/g, userData.plex_username || userData.iptv_username || '')
        .replace(/\{\{plex_username\}\}/g, userData.plex_username || '')
        .replace(/\{\{plex_password\}\}/g, userData.plex_password || '')
        .replace(/\{\{iptv_username\}\}/g, userData.iptv_username || '')
        .replace(/\{\{iptv_password\}\}/g, userData.iptv_password || '')
        .replace(/\{\{implayer_code\}\}/g, userData.implayer_code || '')
        .replace(/\{\{device_count\}\}/g, userData.device_count || '')
        .replace(/\{\{owner_name\}\}/g, userData.owner_name || '')
        .replace(/\{\{owner_email\}\}/g, userData.owner_email || '')
        .replace(/\{\{plex_expiration\}\}/g, userData.plex_expiration || '')
        .replace(/\{\{iptv_expiration\}\}/g, userData.iptv_expiration || '')
        .replace(/\{\{subscription_type\}\}/g, userData.subscription_type || '')
        .replace(/\{\{days_until_expiration\}\}/g, userData.days_until_expiration || '')
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