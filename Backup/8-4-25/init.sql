-- JohnsonFlix Database Schema - FINAL CORRECTED VERSION WITH IPTV EDITOR
-- Fresh database setup with proper single subscription constraints
-- FREE subscriptions use NULL subscription_type_id (no FREE subscription types in database)
CREATE DATABASE IF NOT EXISTS subsapp_db;
USE subsapp_db;

-- Owners table
CREATE TABLE owners (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Subscription types table
CREATE TABLE subscription_types (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  type ENUM('plex', 'iptv') NOT NULL,
  duration_months INT NOT NULL,
  streams INT NULL,
  price DECIMAL(10,2) NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Users table
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  owner_id INT,
  plex_email VARCHAR(255),
  iptv_username VARCHAR(255),
  iptv_password VARCHAR(255),
  implayer_code VARCHAR(255),
  device_count INT DEFAULT 1 COMMENT 'iMPlayer device count limit',
  bcc_owner_renewal BOOLEAN DEFAULT FALSE,
  exclude_bulk_emails BOOLEAN DEFAULT FALSE COMMENT 'If true, user will be excluded from bulk emails',
  exclude_automated_emails BOOLEAN DEFAULT FALSE COMMENT 'If true, user will be excluded from automated renewal reminders',
  tags JSON,
  plex_libraries JSON,
  pending_plex_invites JSON DEFAULT NULL COMMENT 'Tracks pending Plex server invitations for this user',
  iptv_line_id VARCHAR(20) NULL COMMENT 'IPTV panel user ID',
  iptv_package_id VARCHAR(10) NULL COMMENT 'Current IPTV package ID',
  iptv_package_name VARCHAR(100) NULL COMMENT 'Current IPTV package name',
  iptv_expiration DATETIME NULL COMMENT 'IPTV subscription expiration date',
  iptv_days_until_expiration INT NULL COMMENT 'Calculated days until IPTV expiration',
  iptv_credits_used INT DEFAULT 0 COMMENT 'Total credits spent on this user',
  iptv_channel_group_id INT NULL COMMENT 'Assigned custom channel group',
  iptv_connections INT NULL COMMENT 'Max allowed connections for this user',
  iptv_m3u_url TEXT NULL COMMENT 'Generated M3U Plus playlist URL',
  iptv_is_trial BOOLEAN DEFAULT FALSE COMMENT 'Whether current subscription is trial',
  iptv_notes TEXT NULL COMMENT 'Notes about user IPTV subscription',
  include_in_iptv_editor BOOLEAN DEFAULT TRUE COMMENT 'Include user in IPTV Editor sync',
  iptv_editor_enabled BOOLEAN DEFAULT FALSE COMMENT 'User has IPTV Editor account',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE SET NULL
);

-- Subscriptions table - FINAL CORRECTED VERSION
-- subscription_type_id can be NULL for FREE subscriptions
CREATE TABLE subscriptions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  subscription_type_id INT NULL COMMENT 'NULL for FREE subscriptions',
  start_date DATE NOT NULL,
  expiration_date DATE NULL COMMENT 'NULL for FREE subscriptions (never expire)',
  status ENUM('active', 'expired', 'cancelled') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subscription_type_id) REFERENCES subscription_types(id)
);

-- Email templates table
CREATE TABLE email_templates (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL UNIQUE,
  subject VARCHAR(500) NOT NULL,
  body TEXT NOT NULL,
  template_type ENUM('welcome', 'renewal-7day', 'renewal-2day', 'expired', 'manual', 'custom') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Settings table
CREATE TABLE settings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  setting_key VARCHAR(255) NOT NULL UNIQUE,
  setting_value TEXT,
  setting_type ENUM('string', 'number', 'boolean', 'json') DEFAULT 'string',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Plex servers table
CREATE TABLE plex_servers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  url VARCHAR(500) NOT NULL,
  token VARCHAR(500) NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  libraries JSON,
  last_sync TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Email logs table
CREATE TABLE email_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT,
  recipient_email VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  template_used VARCHAR(255),
  status ENUM('sent', 'failed', 'pending') DEFAULT 'pending',
  error_message TEXT,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Email schedules table
CREATE TABLE email_schedules (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  schedule_type ENUM('expiration_reminder', 'specific_date') NOT NULL,
  days_before_expiration INT NULL,
  subscription_type ENUM('plex', 'iptv', 'both') NULL,
  scheduled_date DATE NULL,
  scheduled_time TIME NULL,
  email_template_id INT NOT NULL,
  target_tags JSON NULL,
  exclude_users_with_setting BOOLEAN DEFAULT TRUE,
  active BOOLEAN DEFAULT TRUE,
  next_run DATETIME NULL,
  last_run DATETIME NULL,
  run_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (email_template_id) REFERENCES email_templates(id) ON DELETE CASCADE
);

-- NEW IPTV TABLES
-- IPTV Packages (synced from panel)
CREATE TABLE iptv_packages (
  id INT PRIMARY KEY AUTO_INCREMENT,
  package_id VARCHAR(10) NOT NULL,
  name VARCHAR(100) NOT NULL,
  connections INT NOT NULL,
  duration_months INT NOT NULL,
  credits INT NOT NULL,
  package_type ENUM('trial', 'basic', 'full', 'live_tv') NOT NULL,
  is_active BOOLEAN DEFAULT true,
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_package (package_id),
  INDEX idx_package_type (package_type),
  INDEX idx_is_active (is_active)
);

-- Custom Channel Groups
CREATE TABLE iptv_channel_groups (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  bouquet_ids JSON NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_is_active (is_active)
);

-- Bouquet Master List
CREATE TABLE iptv_bouquets (
  id INT PRIMARY KEY AUTO_INCREMENT,
  bouquet_id VARCHAR(10) NOT NULL,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_bouquet (bouquet_id),
  INDEX idx_category (category),
  INDEX idx_is_active (is_active)
);

-- IPTV User Activity Log
CREATE TABLE iptv_activity_log (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT,
  line_id VARCHAR(20),
  action ENUM('create_trial', 'create_paid', 'extend', 'sync', 'error', 'delete') NOT NULL,
  package_id VARCHAR(10),
  credits_used INT DEFAULT 0,
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  api_response JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_line_id (line_id),
  INDEX idx_action (action),
  INDEX idx_created_at (created_at)
);

-- ========================================
-- IPTV EDITOR INTEGRATION TABLES
-- ========================================

-- IPTV Editor settings table
CREATE TABLE iptv_editor_settings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  setting_key VARCHAR(100) NOT NULL UNIQUE,
  setting_value TEXT,
  setting_type ENUM('string', 'json', 'boolean', 'integer') DEFAULT 'string',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- IPTV Editor user management table
CREATE TABLE iptv_editor_users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  iptv_editor_id INT,
  iptv_editor_username VARCHAR(100),
  iptv_editor_password VARCHAR(100),
  m3u_code VARCHAR(50),
  epg_code VARCHAR(50),
  expiry_date TIMESTAMP,
  max_connections INT DEFAULT 1,
  sync_status ENUM('pending', 'synced', 'error') DEFAULT 'pending',
  last_sync_time TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_id (user_id),
  UNIQUE KEY unique_iptv_username (iptv_editor_username)
);

-- IPTV Editor sync operation logging table
CREATE TABLE iptv_sync_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  sync_type ENUM('user_create', 'user_sync', 'user_delete', 'playlist_sync', 'scheduled_sync') NOT NULL,
  user_id INT NULL,
  status ENUM('success', 'error', 'pending') DEFAULT 'pending',
  request_data JSON,
  response_data JSON,
  error_message TEXT,
  duration_ms INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Insert default owners
INSERT INTO owners (name, email) VALUES 
('Andrew', 'arjohnson15@gmail.com'),
('System Admin', 'admin@johnsonflix.com');

-- Insert subscription types - ONLY PAID SUBSCRIPTIONS (no FREE types)
INSERT INTO subscription_types (name, type, duration_months, streams, price, active) VALUES
('Plex 12 Month', 'plex', 12, NULL, 120.00, TRUE),                    -- ID 1: Paid Plex
('IPTV 3 Month - 1 Stream', 'iptv', 3, 1, 25.00, TRUE),             -- ID 2: IPTV options
('IPTV 3 Month - 2 Streams', 'iptv', 3, 2, 40.00, TRUE),            -- ID 3
('IPTV 6 Month - 1 Stream', 'iptv', 6, 1, 45.00, TRUE),             -- ID 4
('IPTV 3 Month - 5 Streams', 'iptv', 3, 5, 75.00, TRUE);            -- ID 5

-- Insert default email templates
INSERT INTO email_templates (name, subject, body, template_type) VALUES
('Welcome Email', 'Welcome to {{subscription_type}}!', 
'<h2 style="color: #8e24aa;">Welcome {{name}}!</h2>
<p>Thank you for subscribing to our {{subscription_type}} service. Your account has been activated.</p>
<p><strong>Account Details:</strong></p>
<ul>
<li><strong>Plex Email:</strong> {{plex_email}}</li>
<li><strong>IPTV Username:</strong> {{iptv_username}}</li>
<li><strong>IPTV Password:</strong> {{iptv_password}}</li>
<li><strong>iMPlayer Code:</strong> {{implayer_code}}</li>
<li><strong>Device Limit:</strong> {{device_count}}</li>
</ul>
<p><strong>Expiration Date:</strong> {{plex_expiration}}</p>
<p>If you have any questions, please contact {{owner_name}} at {{owner_email}} or our support team.</p>
<p>Best regards,<br>JohnsonFlix Team</p>', 'welcome'),

('7-Day Renewal Reminder', 'Subscription Renewal Reminder - 7 Days',
'<h2 style="color: #ff9800;">Renewal Reminder</h2>
<p>Hello {{name}},</p>
<p>This is a friendly reminder that your {{subscription_type}} subscription will expire in {{days_until_expiration}} days.</p>
<p><strong>Expiration Date:</strong> {{plex_expiration}}</p>
<p><strong>Renewal Price:</strong> {{renewal_price}}</p>
<p>To ensure uninterrupted service, please renew before the expiration date.</p>
<p>Payment Options:</p>
<p>
<a href="{{paypal_link}}" style="background: #0070ba; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin: 5px;">PayPal</a>
<a href="{{venmo_link}}" style="background: #3d95ce; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin: 5px;">Venmo</a>
<a href="{{cashapp_link}}" style="background: #00d632; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin: 5px;">CashApp</a>
</p>
<p>Thank you for your continued support!</p>', 'renewal-7day');

-- Insert default settings
INSERT INTO settings (setting_key, setting_value, setting_type) VALUES
('app_title', 'JOHNSONFLIX', 'string'),
('app_subtitle', 'Subscription Management System', 'string'),
('company_name', 'JohnsonFlix', 'string'),
('smtp_host', 'smtp.gmail.com', 'string'),
('smtp_port', '587', 'number'),
('auto_renewals', 'true', 'boolean'),
('check_interval', '6', 'number'),
('paypal_link', '', 'string'),
('venmo_link', '', 'string'),
('cashapp_link', '', 'string'),
('primary_color', '#8e24aa', 'string'),
('secondary_color', '#3f51b5', 'string'),
('accent_color', '#4fc3f7', 'string'),
('iptv_panel_base_url', '', 'string'),
('iptv_panel_login_url', '', 'string'),
('iptv_panel_username', '', 'string'),
('iptv_panel_password', '', 'string'),
('iptv_package_id_for_bouquets', '46', 'string'),
('iptv_csrf_token', '', 'string'),
('iptv_csrf_expires', '', 'string'),
('iptv_credits_balance', '0', 'number'),
('iptv_last_sync', '', 'string'),
('iptv_auto_sync_enabled', 'true', 'boolean'),
('iptv_session_cookies', '', 'string'),
('iptv_sync_interval_hours', '1', 'number'),
('iptv_packages_count', '0', 'number'),
('iptv_bouquets_count', '0', 'number'),
('iptv_packages_last_sync', '', 'string'),
('iptv_bouquets_last_sync', '', 'string'),
('iptv_credits_last_sync', '', 'string');

-- Insert default IPTV Editor settings
INSERT INTO iptv_editor_settings (setting_key, setting_value, setting_type) VALUES
('bearer_token', '', 'string'),
('base_url', 'https://editor.iptveditor.com', 'string'),
('default_playlist_id', '', 'string'),
('default_playlist_name', '', 'string'),
('sync_schedule_hours', '24', 'integer'),
('sync_enabled', 'false', 'boolean'),
('last_sync_time', '', 'string'),
('default_channels_categories', '[]', 'json'),
('default_vods_categories', '[73]', 'json'),
('default_series_categories', '[]', 'json');

-- Insert sample users
INSERT INTO users (name, email, owner_id, plex_email, iptv_username, iptv_password, implayer_code, device_count, bcc_owner_renewal, tags, include_in_iptv_editor, iptv_editor_enabled) VALUES
('test 1', 'andrew+plextest3@cloudjohnson.com', 1, 'andrew+plextest3@cloudjohnson.com', 'andrew_iptv', 'iptv456', 'ABC123', 2, true, '["Plex 1", "Plex 2", "IPTV"]', true, false),
('test 2', 'andrew+plextest4@cloudjohnson.com', 1, 'andrew+plextest4@cloudjohnson.com', '', '', '', 1, false, '["Plex 1"]', true, false);

-- Insert sample subscriptions - FREE subscriptions use NULL subscription_type_id
INSERT INTO subscriptions (user_id, subscription_type_id, start_date, expiration_date, status) VALUES
(1, NULL, CURDATE(), NULL, 'active'),                                  -- test 1: FREE Plex Access (NULL subscription_type_id)
(1, 2, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 7 DAY), 'active'),     -- test 1: IPTV expiring soon
(2, 1, '2024-04-15', '2025-04-15', 'active');                         -- test 2: Paid Plex

-- =============================================
-- UPDATED TRIGGERS FOR NULL subscription_type_id
-- =============================================

-- Create bulletproof triggers to prevent duplicate active subscriptions
DELIMITER //

CREATE TRIGGER enforce_single_subscription_per_type_insert
BEFORE INSERT ON subscriptions
FOR EACH ROW
BEGIN
  DECLARE existing_count INT DEFAULT 0;
  DECLARE subscription_type_name VARCHAR(10);
  
  -- Only enforce for active subscriptions
  IF NEW.status = 'active' THEN
    -- Handle FREE subscriptions (NULL subscription_type_id)
    IF NEW.subscription_type_id IS NULL THEN
      -- For FREE subscriptions, assume they are plex type
      SET subscription_type_name = 'plex';
      
      -- Count existing FREE plex subscriptions
      SELECT COUNT(*) INTO existing_count
      FROM subscriptions s
      WHERE s.user_id = NEW.user_id 
        AND s.subscription_type_id IS NULL
        AND s.status = 'active';
        
    ELSE
      -- Get the type of the paid subscription being inserted
      SELECT type INTO subscription_type_name 
      FROM subscription_types 
      WHERE id = NEW.subscription_type_id;
      
      -- Count any existing active subscriptions of the same type (including FREE for plex)
      SELECT COUNT(*) INTO existing_count
      FROM subscriptions s
      LEFT JOIN subscription_types st ON s.subscription_type_id = st.id
      WHERE s.user_id = NEW.user_id 
        AND s.status = 'active'
        AND (
          (s.subscription_type_id IS NULL AND subscription_type_name = 'plex') OR
          (st.type = subscription_type_name)
        );
    END IF;
    
    -- Prevent duplicate active subscriptions of the same type
    IF existing_count > 0 THEN
      IF subscription_type_name = 'plex' THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'User already has an active plex subscription. Only one active subscription per type is allowed.';
      ELSE
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'User already has an active iptv subscription. Only one active subscription per type is allowed.';
      END IF;
    END IF;
  END IF;
END//

CREATE TRIGGER enforce_single_subscription_per_type_update
BEFORE UPDATE ON subscriptions
FOR EACH ROW
BEGIN
  DECLARE existing_count INT DEFAULT 0;
  DECLARE subscription_type_name VARCHAR(10);
  
  -- Only check if we're activating a subscription or changing key fields
  IF NEW.status = 'active' AND (
    OLD.status != 'active' OR 
    OLD.subscription_type_id != NEW.subscription_type_id OR 
    OLD.user_id != NEW.user_id
  ) THEN
    -- Handle FREE subscriptions (NULL subscription_type_id)
    IF NEW.subscription_type_id IS NULL THEN
      SET subscription_type_name = 'plex';
      
      SELECT COUNT(*) INTO existing_count
      FROM subscriptions s
      WHERE s.user_id = NEW.user_id 
        AND s.subscription_type_id IS NULL
        AND s.status = 'active'
        AND s.id != NEW.id;
        
    ELSE
      -- Get the type of the paid subscription being updated
      SELECT type INTO subscription_type_name 
      FROM subscription_types 
      WHERE id = NEW.subscription_type_id;
      
      -- Count any other active subscriptions of the same type
      SELECT COUNT(*) INTO existing_count
      FROM subscriptions s
      LEFT JOIN subscription_types st ON s.subscription_type_id = st.id
      WHERE s.user_id = NEW.user_id 
        AND s.status = 'active'
        AND s.id != NEW.id
        AND (
          (s.subscription_type_id IS NULL AND subscription_type_name = 'plex') OR
          (st.type = subscription_type_name)
        );
    END IF;
    
    -- Prevent duplicate active subscriptions of the same type
    IF existing_count > 0 THEN
      IF subscription_type_name = 'plex' THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'User already has an active plex subscription. Only one active subscription per type is allowed.';
      ELSE
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'User already has an active iptv subscription. Only one active subscription per type is allowed.';
      END IF;
    END IF;
  END IF;
END//

DELIMITER ;

-- Add indexes for better performance
CREATE INDEX idx_subscriptions_user_status ON subscriptions(user_id, status);
CREATE INDEX idx_subscriptions_type_status ON subscription_types(type, active);
CREATE INDEX idx_subscriptions_expiration ON subscriptions(expiration_date, status);

-- Insert sample IPTV data
INSERT INTO iptv_packages (package_id, name, connections, duration_months, credits, package_type) VALUES
('150', '2 Connections - 1 Month', 2, 1, 1, 'full'),
('151', '4 Connections - 1 Month', 4, 1, 2, 'full'),
('152', '6 Connections - 1 Month', 6, 1, 3, 'full'),
('159', '2 Connections - 12 Months', 2, 12, 12, 'full'),
('160', '4 Connections - 12 Months', 4, 12, 24, 'full'),
('175', 'Live TV 2 Connections - 1 Month', 2, 1, 1, 'live_tv'),
('176', 'Live TV 4 Connections - 1 Month', 4, 1, 2, 'live_tv');

INSERT INTO iptv_channel_groups (name, description, bouquet_ids) VALUES
('Premium Package', 'USA, CAN, UK, LAT, SPORTS, 24/7, VOD, PPV, ADULT', 
 JSON_ARRAY('130', '134', '137', '144', '145', '146', '147')),
('Family Friendly', 'USA, CAN, UK, SPORTS, 24/7 (No Adult Content)', 
 JSON_ARRAY('130', '134', '137', '144', '145', '146'));

-- Add indexes for IPTV Editor tables for better performance
CREATE INDEX idx_iptv_editor_users_user_id ON iptv_editor_users(user_id);
CREATE INDEX idx_iptv_editor_users_sync_status ON iptv_editor_users(sync_status);
CREATE INDEX idx_iptv_sync_logs_user_id ON iptv_sync_logs(user_id);
CREATE INDEX idx_iptv_sync_logs_sync_type ON iptv_sync_logs(sync_type);
CREATE INDEX idx_iptv_sync_logs_status ON iptv_sync_logs(status);
CREATE INDEX idx_iptv_editor_settings_key ON iptv_editor_settings(setting_key);