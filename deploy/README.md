# Deployment & Operations Guide

This guide covers running the **National Identity Verification Portal** (Next.js) and the **Verification Worker** (FastAPI) locally for development and in production on a VPS.

---

## Architecture Overview

```
[ Browser / Citizen ]
         │
         ▼ (HTTPS:443)
   [ Nginx Reverse Proxy ]
         │
         ▼ (HTTP:3000)
[ Next.js App / API Routes ]
         │
         ▼ (HTTP:8001 with x-worker-secret)
[ Python FastAPI Worker (127.0.0.1:8001) ]
         │
         ▼ (HTTPS:8080 with Bearer Token)
[ Central Identity Platform (138.252.124.48:8080) ]
```

> **IMPORTANT FIREWALL / IP ALLOWLIST NOTICE:**
> The Central Identity Platform enforces an IP allowlist (`403 caller IP not in allowlist`). The `INTERNAL_ALLOWED_IPS` configuration on the Central Identity Platform **must contain the outbound public IP address** that the platform sees from the server running the Python worker.
> Verify your worker host's public IP using `curl -4 ifconfig.me` and have it allowlisted before going live.

---

## Environment Variables Reference

### Next.js Portal (`.env.local`)

| Variable | Required | Description | Example |
| :--- | :--- | :--- | :--- |
| `WORKER_URL` | **Yes** | Base URL of the Python worker | `http://127.0.0.1:8001` |
| `WORKER_SECRET` | **Yes** | Shared secret between Next.js and worker (min 32 chars) | `openssl rand -hex 32` |
| `TRUST_PROXY` | Optional | Set to `true` if behind reverse proxy (reads `x-forwarded-for`) | `false` or `true` |
| `TURNSTILE_SECRET_KEY` | Optional | Cloudflare Turnstile secret key for server-side verification | `0x4AAAAAA...` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Optional | Cloudflare Turnstile site key rendered by client widget | `0x4AAAAAA...` |

### Python Worker (`verifier/.env`)

| Variable | Required | Description | Example |
| :--- | :--- | :--- | :--- |
| `WORKER_SECRET` | **Yes** | Shared secret matching Next.js `WORKER_SECRET` (min 32 chars) | `openssl rand -hex 32` |
| `PLATFORM_URL` | **Yes\*** | URL of Central Identity Platform (`*`required if MOCK_MODE=false) | `http://138.252.124.48:8080` |
| `PLATFORM_API_KEY` | **Yes\*** | Bearer API token issued by the Central Identity Platform | `your-secret-platform-key` |
| `MOCK_MODE` | Optional | Set to `true` for local offline development; `false` in production | `false` |

---

## 1. Local Development Setup

### A. Python Worker (Local)

1. Navigate to the `verifier` directory:
   ```bash
   cd verifier
   ```

2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   # On Linux/macOS:
   source venv/bin/activate
   # On Windows:
   .\venv\Scripts\activate
   ```

3. Install pinned dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Configure environment variables:
   ```bash
   cp .env.example .env
   ```
   For offline testing, you can set `MOCK_MODE=true` in `verifier/.env`:
   - Mock accepts NID `1234567890` + DOB `2002-10-12` -> match `true`
   - Any other combination returns match `false`
   - Startup emits a prominent warning banner

5. Generate a 32-byte worker secret:
   ```bash
   openssl rand -hex 32
   ```
   Paste the generated string into `WORKER_SECRET` in both `verifier/.env` and root `.env.local`.

6. Start the worker:
   ```bash
   uvicorn main:app --host 127.0.0.1 --port 8001 --reload
   ```

### B. Next.js Portal (Local)

1. In the project root, configure `.env.local`:
   ```bash
   cp .env.local.example .env.local
   ```
   Ensure `WORKER_SECRET` matches the one in `verifier/.env`.

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run development server:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

---

## 2. Production VPS Deployment

### Prerequisites
- Ubuntu 22.04 / 24.04 LTS (or Debian 12)
- Node.js 20+ or 22+ LTS
- Python 3.10+
- Nginx
- Dedicated non-root user (`appuser`)

### A. Deploy Python Worker as Systemd Service

1. Create application directory and set permissions:
   ```bash
   sudo mkdir -p /opt/nid-portal
   sudo useradd -r -s /bin/false appuser || true
   sudo chown -R appuser:appuser /opt/nid-portal
   ```

2. Copy code into `/opt/nid-portal`:
   ```bash
   sudo rsync -av --exclude 'node_modules' --exclude '.next' --exclude 'venv' ./ /opt/nid-portal/
   ```

3. Create virtual environment and install packages:
   ```bash
   cd /opt/nid-portal/verifier
   sudo -u appuser python3 -m venv venv
   sudo -u appuser /opt/nid-portal/verifier/venv/bin/pip install --upgrade pip
   sudo -u appuser /opt/nid-portal/verifier/venv/bin/pip install -r requirements.txt
   ```

4. Set up production environment file (`/opt/nid-portal/verifier/.env`):
   ```ini
   WORKER_SECRET=<generated_64_char_hex_secret>
   PLATFORM_URL=http://138.252.124.48:8080
   PLATFORM_API_KEY=<production_platform_bearer_token>
   MOCK_MODE=false
   ```
   Protect permissions:
   ```bash
   sudo chown appuser:appuser /opt/nid-portal/verifier/.env
   sudo chmod 600 /opt/nid-portal/verifier/.env
   ```

5. Install and enable the systemd unit:
   ```bash
   sudo cp /opt/nid-portal/deploy/verifier.service /etc/systemd/system/verifier.service
   sudo systemctl daemon-reload
   sudo systemctl enable --now verifier.service
   sudo systemctl status verifier.service
   ```

### B. Deploy Next.js Web Application

Option 1: Using PM2 (Recommended)
1. Install PM2 globally:
   ```bash
   sudo npm install -g pm2
   ```

2. Prepare environment file (`/opt/nid-portal/.env.local`):
   ```ini
   WORKER_URL=http://127.0.0.1:8001
   WORKER_SECRET=<same_secret_as_verifier>
   TRUST_PROXY=true
   TURNSTILE_SECRET_KEY=<turnstile_secret_key>
   NEXT_PUBLIC_TURNSTILE_SITE_KEY=<turnstile_site_key>
   ```

3. Build and launch:
   ```bash
   cd /opt/nid-portal
   sudo -u appuser npm ci
   sudo -u appuser npm run build
   sudo -u appuser pm2 start npm --name "nid-portal" -- start
   sudo -u appuser pm2 save
   ```

Option 2: Using Systemd
Alternatively, run via `npm run build && npm start` within a standard systemd service pointing to `/opt/nid-portal`.

### C. Nginx Reverse Proxy Configuration

Install Nginx and configure HTTPS termination pointing to `http://127.0.0.1:3000`:

```nginx
server {
    listen 80;
    server_name nid.example.gov;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name nid.example.gov;

    ssl_certificate /etc/letsencrypt/live/nid.example.gov/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nid.example.gov/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # Maximum payload size (portal requires < 1KB)
    client_max_body_size 64k;

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

    # NEVER expose the worker port (8001) to external traffic.
    # The worker must remain bound to 127.0.0.1 only.
}
```

---

## 3. Operational Verification

1. Verify worker status and health:
   ```bash
   sudo journalctl -u verifier.service -f
   ```
2. Verify rate-limiting logs:
   All logs output structured JSON-ish lines containing timestamp, job ID, status, and masked NIDs. No raw NID, DOB, or secret is ever printed.
