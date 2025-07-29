# Subscription Manager 

A comprehensive Docker-based subscription management system for Plex and IPTV services with automated email reminders and real-time integrations.

## Features

- **User Management** - Complete CRUD operations with owner relationships and subscription tracking
- **Plex Integration** - Real-time API integration with multiple Plex servers for library management
- **IPTV Integration** - Full integration with pinkpony.lol panel for subscription and user management
- **Automated Email System** - 7-day and 2-day renewal reminders with customizable templates
- **Owner Management** - BCC notifications and user relationship tracking
- **Payment Integration** - Support for PayPal, Venmo, and CashApp payment links
- **Dashboard Analytics** - Real-time statistics and expiring user alerts
- **Responsive Web Interface** - Modern cyberpunk-themed UI with mobile support

## Quick Start

### 1. Clone and Setup
```bash
git clone https://github.com/yourusername/johnsonflix-manager.git
cd johnsonflix-manager
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your settings (see Configuration section)
```

### 3. Start with Docker
```bash
docker-compose up -d
```

### 4. Access Application
- Open `http://localhost:3700` in your browser
- The application will be ready to use immediately!

## Configuration

### Required Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Database (auto-configured for Docker)
DB_HOST=db
DB_USER=johnsonflix
DB_PASSWORD=your_secure_password
DB_NAME=subsapp_db

# Email Configuration (Gmail recommended)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-gmail-app-password

# Plex Servers (optional - can be configured via UI)
PLEX_SERVER_1_URL=https://your-plex-server.com:32400
PLEX_SERVER_1_TOKEN=your-plex-token
PLEX_SERVER_2_URL=https://your-second-plex.com:32400
PLEX_SERVER_2_TOKEN=your-second-plex-token

# IPTV Integration
IPTV_PANEL_URL=https://panel.pinkpony.lol
IPTV_USERNAME=your_panel_username
IPTV_PASSWORD=your_panel_password
```

## Setup Guides

### Gmail Setup for Email Notifications

1. **Enable 2-Factor Authentication** on your Gmail account
2. **Generate App Password**:
   - Go to Google Account settings
   - Security → 2-Step Verification → App passwords
   - Select "Mail" and generate password
3. **Use the app password** (not your regular password) in `SMTP_PASS`

### Getting Plex Tokens

1. Log into your Plex web interface
2. Open browser developer tools → Network tab
3. Refresh the page and look for requests with `X-Plex-Token` header
4. Copy the token value for your environment variables

## Usage

### First-Time Setup

1. **Configure Email** - Settings → Email Configuration
2. **Add Plex Servers** - Settings → Plex Configuration (test connections)
3. **Configure IPTV** - Settings → IPTV Integration (sync packages and bouquets)
4. **Set Payment Links** - Settings → Payment & Links
5. **Add Owners** - Settings → Owner Management
6. **Create Users** - Manage Users → Create New User

### Managing Users

- **Create New Users** - Add with Plex/IPTV credentials and library access
- **Edit Subscriptions** - Update renewals, credentials, library access
- **Bulk Operations** - Apply tags for group management
- **View Details** - Complete user information in modal dialogs

### Email System

- **Templates** - Pre-built welcome, renewal, and expiration templates with dynamic fields
- **Bulk Email** - Send to users by tags (Plex 1, Plex 2, IPTV, etc.)
- **Owner BCC** - Automatically notify owners of user renewals
- **Automated Reminders** - Daily check for users expiring in 7 and 2 days

### Plex Library Management

- **Multi-Server Support** - Manage regular and 4K libraries across multiple servers
- **Library Sharing** - Real-time API integration for user access control
- **Bulk Updates** - Apply library access to multiple users simultaneously

### IPTV Integration

- **Package Sync** - Automatic sync of available IPTV packages
- **Bouquet Management** - Channel group assignment and management
- **User Creation** - Trial and paid account creation through panel API
- **Credit Tracking** - Real-time balance monitoring

## Development

### Local Development Setup
```bash
npm install
npm run dev
```

### Docker Commands
```bash
# Start all services
docker-compose up -d

# View application logs
docker-compose logs -f johnsonflix

# View database logs
docker-compose logs -f db

# Stop all services
docker-compose down

# Restart services
docker-compose restart

# Shell access to container
docker-compose exec johnsonflix sh

# Database shell access
docker-compose exec db mysql -u johnsonflix -p subsapp_db
```

### Database Operations
```bash
# Create backup
docker-compose exec db mysqldump -u johnsonflix -p subsapp_db > backup.sql

# Restore from backup
docker-compose exec -T db mysql -u johnsonflix -p subsapp_db < backup.sql

# View database status
docker-compose exec db mysql -u johnsonflix -p -e "SHOW DATABASES;"
```

## File Structure

```
johnsonflix-manager/
├── server.js                    # Main Express application
├── package.json                 # Node.js dependencies
├── docker-compose.yml           # Docker services configuration
├── Dockerfile                   # Container build instructions
├── init.sql                     # Database schema and initial data
├── .env.example                 # Environment variables template
├── database-config.js           # MySQL connection configuration
├── routes/
│   ├── routes-auth.js           # Authentication endpoints
│   ├── users-routes.js          # User management API
│   ├── routes-subscriptions.js  # Subscription type management
│   ├── routes-email.js          # Email template and sending
│   ├── routes-plex.js           # Plex server integration
│   ├── routes-settings.js       # Application settings
│   └── routes-owners.js         # Owner management
├── services/
│   ├── email-service.js         # Email handling with nodemailer
│   ├── plex-service.js          # Plex API integration
│   └── iptv-service.js          # IPTV panel integration
├── config/
│   └── plex-config.js           # Plex server configurations
└── public/
    ├── index.html               # Main application HTML
    ├── css/
    │   ├── main.css             # Base styles
    │   ├── components.css       # UI components
    │   └── themes.css           # Color schemes
    ├── js/
    │   ├── app.js               # Main application logic
    │   ├── api.js               # API communication
    │   ├── users.js             # User management
    │   ├── plex.js              # Plex functionality
    │   ├── email.js             # Email management
    │   ├── settings.js          # Settings interface
    │   └── utils.js             # Utility functions
    └── pages/
        ├── dashboard.html       # Dashboard page
        ├── users.html           # User listing
        ├── user-form.html       # User creation/editing
        └── settings.html        # Settings interface
```

## API Documentation

### User Management
- `GET /api/users` - List all users with pagination
- `POST /api/users` - Create new user
- `GET /api/users/:id` - Get user details
- `PUT /api/users/:id` - Update user information
- `DELETE /api/users/:id` - Delete user
- `GET /api/users/expiring/:days` - Get users expiring in X days

### Plex Integration
- `GET /api/plex/servers` - List configured Plex servers
- `POST /api/plex/test-connection` - Test server connectivity
- `GET /api/plex/libraries/:serverId` - Get server libraries
- `POST /api/plex/share-libraries` - Share libraries with user

### IPTV Integration
- `GET /api/iptv/packages` - List available IPTV packages
- `POST /api/iptv/sync-packages` - Sync packages from panel
- `GET /api/iptv/bouquets` - List channel bouquets
- `POST /api/iptv/create-user` - Create IPTV user account

### Email System
- `GET /api/email/templates` - List email templates
- `POST /api/email/send` - Send email to user(s)
- `POST /api/email/bulk` - Send bulk email by tags

## Troubleshooting

### Common Issues

**Database Connection Failed**
```bash
# Check if database container is running
docker-compose ps db

# Check database logs
docker-compose logs db

# Restart database
docker-compose restart db
```

**Email Not Sending**
- Verify Gmail app password is correct
- Check SMTP settings in environment variables
- Test email configuration in Settings → Email

**Plex Integration Issues**
- Verify Plex tokens are valid
- Test server connectivity in Settings → Plex
- Check server URLs include port numbers

**IPTV Panel Connection**
- Verify panel credentials in environment variables
- Check network connectivity to panel URL
- Review IPTV service logs for authentication errors

### Performance Optimization

**Database Performance**
```sql
-- Add indexes for better query performance
ALTER TABLE users ADD INDEX idx_subscription_expiry (subscription_expiry);
ALTER TABLE users ADD INDEX idx_tags (tags);
```

**Docker Resource Limits**
```yaml
# In docker-compose.yml
services:
  johnsonflix:
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
```

## Security Considerations

- All passwords are hashed using bcrypt
- CSRF protection enabled for form submissions
- Input validation and sanitization implemented
- Database queries use parameterized statements
- Email templates sanitize user input
- API endpoints include rate limiting

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues and questions:
- Create an issue in the GitHub repository
- Check the troubleshooting section above
- Review application logs: `docker-compose logs -f johnsonflix`
