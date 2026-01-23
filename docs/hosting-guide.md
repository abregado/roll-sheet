---
layout: default
title: Hosting Guide
---

[← Back to Documentation](index) | [User Guide →](user-guide)

# Hosting Guide

Deploy your own Roll Sheet instance for your gaming group.

---

## Table of Contents

- [Requirements](#requirements)
- [Local Development](#local-development)
- [Production Deployment](#production-deployment)
- [Configuration](#configuration)
- [Data Storage](#data-storage)

---

## Requirements

- **Node.js** 18 or higher
- **npm** (included with Node.js)

---

## Local Development

### 1. Clone the Repository

```bash
git clone https://github.com/abregado/roll-sheet.git
cd roll-sheet
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start the Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:3000`.

### Accessing from Other Devices

To access from other devices on your local network (like phones or other computers):

1. Find your computer's local IP address (e.g., `192.168.1.100`)
2. Open `http://192.168.1.100:3000` on the other device

---

## Production Deployment

### Option 1: VPS or Dedicated Server

#### 1. Set Up Your Server

Use any Linux VPS provider (DigitalOcean, Linode, Vultr, etc.). A minimal instance is sufficient.

#### 2. Install Node.js

```bash
# Using NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

#### 3. Clone and Build

```bash
git clone https://github.com/abregado/roll-sheet.git
cd roll-sheet
npm install
npm run build
```

#### 4. Run with Process Manager

Install PM2 for process management:

```bash
sudo npm install -g pm2
pm2 start dist/server.js --name roll-sheet
pm2 save
pm2 startup
```

#### 5. Set Up Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

#### 6. Enable HTTPS

Use Certbot for free SSL certificates:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### Option 2: Docker

Create a `Dockerfile`:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

Build and run:

```bash
docker build -t roll-sheet .
docker run -d -p 3000:3000 -v roll-sheet-data:/app/data roll-sheet
```

### Option 3: Platform as a Service

Roll Sheet can be deployed to platforms like:

- **Railway**
- **Render**
- **Fly.io**

These typically auto-detect Node.js projects. Ensure WebSocket support is enabled.

**Note:** Some free tiers may have connection limits or sleep after inactivity.

---

## Configuration

### Port

The server runs on port 3000 by default. Set the `PORT` environment variable to change it:

```bash
PORT=8080 npm start
```

---

## Data Storage

Roll Sheet stores data in the `data/` directory:

- `sheets.json` - All character sheets
- `history.json` - Roll history

### Backup

Regularly back up the `data/` directory:

```bash
cp -r data/ backup/data-$(date +%Y%m%d)/
```

### Persistence with Docker

Mount a volume for the data directory:

```bash
docker run -v /path/to/data:/app/data roll-sheet
```

### Data Location

If deploying to a PaaS, ensure the data directory is on persistent storage, not ephemeral filesystem.

---

## Troubleshooting

### WebSocket Connection Failed

- Ensure your reverse proxy is configured to upgrade WebSocket connections
- Check that firewalls allow WebSocket traffic
- Verify the `Upgrade` and `Connection` headers are being passed through

### Changes Not Persisting

- Check file permissions on the `data/` directory
- Ensure the data directory is on persistent storage (not ephemeral)

### High Memory Usage

Roll Sheet is lightweight, but if hosting many concurrent users:
- Increase Node.js memory limit: `NODE_OPTIONS="--max-old-space-size=512"`
- Consider running multiple instances behind a load balancer

---

[← Back to Documentation](index) | [User Guide →](user-guide)
