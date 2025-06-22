# JohnsonFlix Subscription Manager

A Docker-based subscription management system for Plex and IPTV services.

## Features

- **User Management** - Create, edit, view, delete users with owner relationships
- **Plex Integration** - API-based library management for multiple Plex servers
- **IPTV Subscription Tracking** - Manage IPTV subscriptions with expiration dates
- **Automated Email Reminders** - 7-day and 2-day renewal notifications
- **Email Template System** - Customizable templates with dynamic fields
- **Owner Management** - BCC notifications and user relationships
- **Payment Integration** - PayPal, Venmo, CashApp payment links
- **Dashboard** - Real-time statistics and expiring users
- **Responsive Web Interface** - Modern cyberpunk-themed UI

## Quick Start

1. **Clone and Setup**
   ```bash
   git clone <your-repo>
   cd johnsonflix-manager
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

3. **Start with Docker**
   ```bash
   docker-compose up -d
   ```

4. **Access Application**
   - Open `http://localhost:3000` in your browser
   - The application will be ready to use!

## Configuration

### Required Environment Variables

Copy `.env.example` to `.env` and configure:

- **Database**: Already configured for Docker
- **Email (Gmail)**:
  ```bash
  SMTP_USER=your-email@gmail.com
  SMTP_PASS=your-gmail-app-password
  ```
- **Plex Servers** (optional - can be configured via UI):
  ```bash
  PLEX_SERVER_1_URL=https://your-plex.com:32400
  PLEX_SERVER_1_TOKEN=your-plex-token
  ```

### Gmail Setup for Email Notifications

1. Enable 2-factor authentication on your Gmail account
2. Generate an "App Password" in your Google Account settings
3. Use the app password (not your regular password) in `SMTP_PASS`

### Getting Plex Tokens

1. Log into your Plex web interface
2. Open browser developer tools → Network tab
3. Refresh the page and look for requests with `X-Plex-Token` header
4. Copy the token value

## Usage

### First-Time Setup

1. **Configure Email** - Go to Settings → Email Configuration
2. **Add Plex Servers** - Settings → Plex Configuration (test connections)
3. **Set Payment Links** - Settings → Payment & Links
4. **Add Owners** - Settings → Owner Management
5. **Create Users** - Manage Users → Create New User

### Managing Users

- **Create**: Add users with Plex/IPTV credentials and library access
- **Edit**: Update subscriptions, credentials, library access
- **Renewals**: Select new subscription → auto-calculates expiration
- **View**: See complete user details in modal

### Email System

- **Templates**: Pre-built welcome, renewal, and expiration templates
- **Dynamic Fields**: Auto-populate user data, credentials, payment links
- **Bulk Email**: Send to users by tags (Plex 1, Plex 2, IPTV)
- **Owner BCC**: Automatically notify owners of renewals

### Automation

- **Daily Check**: Scans for users expiring in 7 and 2 days
- **Auto Emails**: Sends renewal reminders based on templates
- **Owner Notifications**: BCCs owners when enabled per user

## File Structure

```
johnsonflix-manager/
├── server.js                 # Main Express server
├── package.json              # Dependencies
├── docker-compose.yml        # Docker stack
├── Dockerfile                # Container setup
├── init.sql                  # Database schema
├── .env.example              # Environment template
├── config/
│   └── database.js           # Database connection
├── routes/                   # API endpoints
│   ├── users.js
│   ├── email.js
│   ├── plex.js
│   ├── settings.js
│   └── owners.js
├── services/                 # Business logic
│   ├── emailService.js       # Email handling
│   └── plexService.js        # Plex API integration
└── public/
    └── index.html            # Frontend application
```

## Development

### Local Development
```bash
npm install
npm run dev
```

### Docker Commands
```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Restart
docker-compose restart

# Shell access
docker-compose exec johnsonflix sh
```

### Database Backup
```bash
# Manual backup
docker-compose exec db mysqldump -u johnsonflix -p johnsonflix_db > backup.sql

# Restore
docker-compose exec -T db mysql -u johnsonflix -p johnsonflix_db < backup.sql
```

## API Endpoints

- `GET /api/users` - List all users
- `POST /api/users` - Create user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user
- `POST /api/email/send` - Send email
- `GET /api/plex/servers` - List Plex servers
- `GET /api/owners` - List owners
- `PUT /api/settings` - Update settings

## Security Notes

- Application runs as non-root user in container
- Rate limiting enabled (100 requests per 15 minutes)
- Input validation on all endpoints
- CORS and helmet security headers
- No authentication required (designed for internal use behind proxy)

## Troubleshooting

### Email Not Working
- Verify Gmail app password (not regular password)
- Check SMTP settings in Settings page
- Use "Send Test Email" button

### Plex Connection Issues
- Verify Plex server URL and token
- Ensure Plex server is accessible from Docker container
- Check firewall settings

### Database Issues
- Ensure Docker containers are running: `docker-compose ps`
- Check logs: `docker-compose logs db`
- Verify environment variables in `.env`

## License

MIT License - see LICENSE file for details