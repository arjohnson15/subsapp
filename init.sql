-- JohnsonFlix Database Schema
CREATE DATABASE IF NOT EXISTS johnsonflix_db;
USE johnsonflix_db;

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
  plex_username VARCHAR(255),
  plex_password VARCHAR(255),
  iptv_username VARCHAR(255),
  iptv_password VARCHAR(255),
  implayer_code VARCHAR(255),
  device_count INT DEFAULT 1,
  bcc_owner_renewal BOOLEAN DEFAULT FALSE,
  tags JSON,
  plex_libraries JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE SET NULL
);

-- Subscriptions table
CREATE TABLE subscriptions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  subscription_type_id INT NOT NULL,
  start_date DATE NOT NULL,
  expiration_date DATE,
  is_free BOOLEAN DEFAULT FALSE,
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
  template_type ENUM('welcome', 'renewal-7day', 'renewal-2day', 'expired', 'manual') NOT NULL,
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

-- Insert default owners
INSERT INTO owners (name, email) VALUES 
('Andrew', 'arjohnson15@gmail.com'),
('System Admin', 'admin@johnsonflix.com');

-- Insert default subscription types
INSERT INTO subscription_types (name, type, duration_months, streams, price) VALUES
('Plex 12 Month', 'plex', 12, NULL, 120.00),
('IPTV 3 Month - 1 Stream', 'iptv', 3, 1, 25.00),
('IPTV 3 Month - 2 Streams', 'iptv', 3, 2, 40.00),
('IPTV 6 Month - 1 Stream', 'iptv', 6, 1, 45.00),
('IPTV 3 Month - 5 Streams', 'iptv', 3, 5, 75.00);

-- Insert default email templates
INSERT INTO email_templates (name, subject, body, template_type) VALUES
('Welcome Email', 'Welcome to {{subscription_type}}!', 
'<h2 style="color: #8e24aa;">Welcome {{name}}!</h2>
<p>Thank you for subscribing to our {{subscription_type}} service. Your account has been activated.</p>
<p><strong>Account Details:</strong></p>
<ul>
<li><strong>Plex Username:</strong> {{plex_username}}</li>
<li><strong>Plex Password:</strong> {{plex_password}}</li>
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
('accent_color', '#4fc3f7', 'string');

-- Insert sample users
INSERT INTO users (name, email, owner_id, plex_username, plex_password, iptv_username, iptv_password, implayer_code, device_count, bcc_owner_renewal, tags) VALUES
('Andrew', 'arjohnson15@gmail.com', 1, 'andrew_plex', 'plex123', 'andrew_iptv', 'iptv456', 'ABC123', 2, true, '["Plex 1", "Plex 2", "IPTV"]'),
('Aaron Fleuren', 'afleuren@yahoo.com', 1, 'aaron_plex', 'aaron123', '', '', '', 1, false, '["Plex 1"]'),
('Ashley Henderson', 'ahenderson421@gmail.com', 1, 'ashley_plex', 'ashley123', '', '', '', 1, true, '["Plex 1"]'),
('Adam Kiepe', 'akiepe@gmail.com', 1, 'adam_plex', 'adam123', '', '', '', 1, false, '["Plex 1"]'),
('Chase Usler', 'chaseusler@gmail.com', 1, 'chase_plex', 'chase123', '', '', '', 1, true, '["Plex 1"]'),
('Brian Cerny', 'briancerny@yahoo.com', 1, 'brian_plex', 'brian123', 'brian_iptv', 'brian456', 'DEF456', 2, true, '["Plex 1", "IPTV"]');

-- Insert sample subscriptions
INSERT INTO subscriptions (user_id, subscription_type_id, start_date, expiration_date, is_free, status) VALUES
(1, 1, CURDATE(), NULL, true, 'active'), -- Andrew - Free Plex
(1, 2, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 7 DAY), false, 'active'), -- Andrew - IPTV expiring soon
(2, 1, '2024-04-15', '2025-04-15', false, 'active'), -- Aaron - Paid Plex
(3, 1, '2024-08-22', '2025-08-22', false, 'active'), -- Ashley - Paid Plex
(4, 1, CURDATE(), NULL, true, 'active'), -- Adam - Free Plex
(5, 1, '2024-04-14', '2025-04-14', false, 'active'), -- Chase - Paid Plex
(6, 1, '2024-12-01', '2025-12-01', false, 'active'), -- Brian - Paid Plex
(6, 3, '2024-01-16', '2025-04-16', false, 'active'); -- Brian - IPTV