# Softcents Number Portal (`number-portal.softcents.com`)

Production Node.js DID & Virtual Number Management Platform for Softcents Telecom Network, fully managed under **aaPanel** with isolated PostgreSQL database.

---

## 🛠️ Tech Stack & Architecture

- **Runtime:** Node.js (v26.x)
- **Framework:** Express.js with Helmet security, Compression, CORS, Morgan logger
- **Database:** PostgreSQL (Database: `noportal_sc`, Port: `5432`)
- **Port:** `5000` (Isolated port to ensure 0% conflict with other VPS software)
- **Web Server:** Nginx Reverse Proxy (aaPanel managed)
- **Monitoring:** Integrated `/health` endpoint reporting database latency & memory

---

## 🚀 Quick Start & CLI Operations

### Install Dependencies
```bash
npm install
```

### Run Server Locally
```bash
npm start
```

### Health Check
```bash
curl http://127.0.0.1:5000/health
```

---

## 🛡️ Multi-Software VPS Safety
This server hosts multiple live services. Always read [SERVER_GUIDELINES.md](./SERVER_GUIDELINES.md) before performing maintenance.
- **NEVER** run `pkill -f node` or `killall node`.
- Target **ONLY** port `5000` when restarting this application.
- All operations are compatible with aaPanel Web UI under **Website > Node project**.
