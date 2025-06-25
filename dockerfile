FROM node:18-alpine

# Install Python and required packages
RUN apk add --no-cache \
    python3 \
    py3-pip \
    py3-requests \
    gcc \
    musl-dev \
    python3-dev

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install --production

# Copy application code
COPY . .

# Create Python virtual environment and install plexapi
RUN python3 -m venv /app/venv && \
    /app/venv/bin/pip install --no-cache-dir plexapi

# Create uploads directory
RUN mkdir -p uploads

# Make Python script executable
RUN chmod +x plex_service.py

# Expose port
EXPOSE 3000

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S johnsonflix -u 1001

# Change ownership of app directory
RUN chown -R johnsonflix:nodejs /app
USER johnsonflix

# Start application with Python virtual environment activated
CMD ["sh", "-c", ". /app/venv/bin/activate && npm start"]