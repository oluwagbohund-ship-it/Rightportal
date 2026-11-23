# Dave Timi EdTech Systems — Production Deployment Guide
**Brand:** Dave Timi EdTech Systems  
**Tagline:** Build • Innovate • Transform  
**Architecture:** React 19 + TypeScript + Tailwind CSS + Express + SQLite (`node:sqlite`)

---

## 1. Quick Overview

Dave Timi EdTech Systems is a full-stack multi-tenant education operating system:
- **Frontend:** Single-page React application built into `./dist/`.
- **Backend:** Express API server defined in `server.ts`. In production (`NODE_ENV=production`), it directly serves both the `/api/*` endpoints and the `./dist/` static files with single-page application routing fallback.
- **Database:** Embedded SQLite using Node.js 22 built-in `node:sqlite` with WAL mode, foreign key enforcement, and automated database schema migrations on startup.
- **Storage:** Local persistent disk storage under `./data/` for the SQLite database (`dt_edtech.sqlite`), audit records, and encrypted tenant uploads.

---

## 2. Option A: Google AI Studio (Instant Cloud Run Deployment)

Your applet is already built and running on Google Cloud Run in AI Studio:

- **Shared / Production URL:**  
  `https://ais-pre-f3dtpypsbqfvjyhrwtsgz6-290512810740.europe-west2.run.app`
- **Development Preview URL:**  
  `https://ais-dev-f3dtpypsbqfvjyhrwtsgz6-290512810740.europe-west2.run.app`

### How to Publish Updates:
1. In the AI Studio interface, click the **Share** button in the top navigation bar.
2. Select your access settings (Public or Restricted).
3. The latest committed changes and build bundle are automatically deployed to the Shared URL.

---

## 3. Option B: GitHub Actions Automated CI/CD

Your repository contains an automated workflow at `.github/workflows/build.yml`.

### Deployment Steps:
1. Push your latest code to GitHub:
   ```bash
   git push origin master
   ```
2. The GitHub Actions runner will automatically:
   - Install verified dependencies (`npm ci`).
   - Run type checking and linter (`npm run lint`).
   - Run the 56 automated unit and integration tests (`npm test`).
   - Compile the production bundle (`npm run build`).
   - Verify that `dist/index.html` was generated successfully.

---

## 4. Option C: Deploy with Docker

A production-ready `Dockerfile` and `.dockerignore` are included in the repository.

### Build and Run with Docker:
```bash
# 1. Build the Docker container image
docker build -t dave-timi-edtech:latest .

# 2. Run the container with persistent volume mounting for SQLite
docker run -d \
  --name dt-edtech \
  -p 3000:3000 \
  -v dt_edtech_data:/app/data \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e APP_URL=https://your-domain.com \
  dave-timi-edtech:latest
```

> **CRITICAL**: Always mount a volume (e.g., `-v dt_edtech_data:/app/data`) so that your SQLite database, uploaded school assets, and audit logs are preserved across container restarts.

### Docker Compose (`docker-compose.yml`):
```yaml
services:
  app:
    build: .
    container_name: dave_timi_edtech
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - APP_URL=https://school.yourdomain.com
      - SQLITE_DB_PATH=/app/data/dt_edtech.sqlite
      - DT_BOOTSTRAP_KEY=your-secure-bootstrap-secret
    volumes:
      - dt_data:/app/data

volumes:
  dt_data:
    driver: local
```

---

## 5. Option D: Cloud PaaS (Railway / Render / Fly.io)

### Railway
1. Connect your GitHub repository to Railway.
2. Under **Service Settings**:
   - **Build Command:** `npm run build`
   - **Start Command:** `npm start`
3. Add a **Persistent Volume**:
   - Mount path: `/app/data`
4. Set Environment Variables:
   - `NODE_ENV=production`
   - `SQLITE_DB_PATH=/app/data/dt_edtech.sqlite`
   - `APP_URL=https://${RAILWAY_STATIC_URL}`

### Render
1. Create a new **Web Service** connected to your repository.
2. Select runtime **Node.js (Node 22)**.
3. Configure settings:
   - **Build Command:** `npm ci && npm run build`
   - **Start Command:** `npm start`
4. Attach a **Disk**:
   - Mount path: `/var/data`
   - Size: 5 GB - 20 GB
5. Set Environment Variables:
   - `NODE_ENV=production`
   - `SQLITE_DB_PATH=/var/data/dt_edtech.sqlite`

### Fly.io
1. Initialize Fly: `fly launch`
2. Create persistent volume: `fly volumes create dt_data --size 10`
3. In `fly.toml`, mount volume:
   ```toml
   [mounts]
     source = "dt_data"
     destination = "/app/data"
   ```
4. Deploy: `fly deploy`

---

## 6. Option E: Traditional Linux VPS (Ubuntu / Debian + Nginx + PM2)

### 1. Install Node.js 22
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx git
```

### 2. Clone & Build
```bash
cd /var/www
git clone <your-repo-url> dt-edtech
cd dt-edtech

# Install dependencies and build frontend
npm ci
npm run build
```

### 3. Setup PM2 Process Manager
```bash
sudo npm install -g pm2

# Start the application
pm2 start server.ts --name "dt-edtech" --interpreter tsx --env NODE_ENV=production

# Save PM2 process list to restart on reboot
pm2 save
pm2 startup
```

### 4. Configure Nginx Reverse Proxy (`/etc/nginx/sites-available/dt-edtech`)
```nginx
server {
    server_name portal.yourdomain.com;

    client_max_body_size 16M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable site and configure SSL with Certbot:
```bash
sudo ln -s /etc/nginx/sites-available/dt-edtech /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d portal.yourdomain.com
```

---

## 7. Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | Yes | Set to `production` for production bundling and caching. |
| `PORT` | Optional | HTTP port to listen on (default: `3000`). |
| `APP_URL` | Recommended | Canonical URL of your app (e.g. `https://portal.dtsystems.edu`). |
| `SQLITE_DB_PATH` | Recommended | File path for the SQLite database (default: `./data/dt_edtech.sqlite`). |
| `DT_BOOTSTRAP_KEY` | Optional | Shared secret key for initial Platform Owner account bootstrap. |
| `GEMINI_API_KEY` | Optional | Google Gemini API key for DT AI Core assistant and document analysis. |
| `SMTP_HOST` | Optional | SMTP host for sending emails (notifications, admission letters). |
| `SMTP_PORT` | Optional | SMTP port (e.g., `587` or `465`). |
| `SMTP_USER` | Optional | SMTP username. |
| `SMTP_PASS` | Optional | SMTP password / app password. |
| `SMTP_FROM` | Optional | Default from address (e.g. `notifications@dtsystems.edu`). |

---

## 8. First-Time Setup After Deployment

1. **Database Auto-Initialization:**  
   When the server boots for the first time, all migrations in `src/db/migrations` run automatically to initialize the schema, indexes, and reference catalogs.
2. **Bootstrap Platform Owner:**  
   Navigate to `/workers/login` on your deployed application. If no owner exists, follow the secure bootstrap workflow to establish the initial Platform Owner superuser credentials.
3. **Register Schools:**  
   Schools can register via `/register-school` or be provisioned directly by the Platform Owner via the Executive Dashboard (`/owner/schools`).
4. **Automated Backups:**  
   The Platform Owner dashboard includes a full database backup and restore manager at `/owner/database` for creating instant database snapshots.
