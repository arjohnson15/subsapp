FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create uploads directory
RUN mkdir -p uploads

# Expose port
EXPOSE 3000

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S johnsonflix -u 1001

# Change ownership of app directory
RUN chown -R johnsonflix:nodejs /app
USER johnsonflix

# Start application
CMD ["npm", "start"]