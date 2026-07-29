# Deploying QueueOS as a real website

Two proven paths. Path A is one server + one domain (cheapest, most control).
Path B is managed services (no server admin, free tiers to start).

---

## Path A — One VPS + your domain (recommended, ~$5/month)

**You need:** a domain (e.g. `queueos.app`) and a small VPS
(Hetzner / DigitalOcean / Lightsail — 1–2 GB RAM is plenty to start).

### 1. Point the domain
In your DNS provider, add two A records to the server's IP:

```
app.queueos.app  -> <server-ip>   (the frontend + console)
api.queueos.app  -> <server-ip>   (the backend API + websockets)
```

### 2. Put the code on the server
```bash
ssh root@<server-ip>
apt update && apt install -y docker.io docker-compose-v2 git
git clone <your-repo> && cd queue-platform
```

### 3. Set production environment
Create a `.env` next to `docker-compose.yml`:

```bash
JWT_SECRET=$(openssl rand -hex 32)        # strong random secret
CLIENT_URL=https://app.queueos.app        # locks CORS to your frontend
PUBLIC_WEB_URL=https://app.queueos.app    # what the QR codes link to
VITE_API_URL=https://api.queueos.app/api  # baked into the frontend build
VITE_SOCKET_URL=https://api.queueos.app
# Optional: SMTP_* for email, TWILIO_* for WhatsApp/SMS
```

### 4. HTTPS with Caddy (automatic certificates)
Caddy sits in front and gets TLS certificates from Let's Encrypt on its own.

```bash
apt install -y caddy
```

`/etc/caddy/Caddyfile`:
```
app.queueos.app {
    reverse_proxy localhost:8080
}
api.queueos.app {
    reverse_proxy localhost:5000
}
```

```bash
systemctl reload caddy
```

### 5. Launch
```bash
docker compose up -d --build
docker compose exec backend npm run seed   # optional demo data
```

Done — `https://app.queueos.app` is live, QR codes point at the real domain,
and websockets work through Caddy automatically.

**Updating later:** `git pull && docker compose up -d --build`.
**Backups:** `docker compose exec mongo mongodump --archive > backup-$(date +%F).gz`
(cron this nightly; copy off-server).

---

## Path B — Managed services (no server to maintain)

| Piece | Service | Notes |
|---|---|---|
| MongoDB | **MongoDB Atlas** (free M0 tier) | copy the connection string into `MONGO_URI` |
| Backend | **Render** / Railway (Docker web service) | point it at `backend/`, set all env vars, it gives you `https://...onrender.com` |
| ML service | second Render service from `ml-service/` | set `ML_SERVICE_URL` on the backend to its URL |
| Frontend | **Vercel** or Netlify | build `frontend/` with `VITE_API_URL` + `VITE_SOCKET_URL` pointing at the backend URL |

Then set `CLIENT_URL` and `PUBLIC_WEB_URL` on the backend to the frontend's
URL. Same app, zero server administration. (Free tiers sleep when idle —
fine for demos, upgrade for real traffic.)

---

## How the multi-tenant "one website, many organizations" works

There is **one** deployment and **one** database for everyone:

1. A business signs up at `/signup` → an `Organization` document is created,
   plus their Admin account. An industry template seeds branches/services.
2. **Every** document (users, branches, tokens, logs…) carries that
   `organization` id. Every API query filters by it.
3. The org id comes **only** from the verified JWT issued at login — never
   from anything the client sends — so Org A physically cannot query Org B's
   rows. (Verified with an adversarial cross-tenant test.)
4. Staff emails are **globally unique**: one email = one account = one
   organization, so login is deterministic. Customers never need accounts —
   they join by QR with just a name/phone.

This is the standard "shared database, shared schema" SaaS pattern — the same
model Shopify and Slack launched with. A separate DB per customer is only
worth it at enterprise/compliance scale.

## Production checklist (before real users)

- [ ] Strong `JWT_SECRET` (the app refuses to boot with a weak one)
- [ ] `CLIENT_URL` set to the real frontend origin (locks CORS)
- [ ] HTTPS via Caddy / platform TLS (QR + geolocation require it on phones)
- [ ] Nightly `mongodump` backups off the server
- [ ] SMTP or Twilio credentials if you want email / WhatsApp / SMS
- [ ] Reseed OFF in production (`npm run seed` wipes data — demo only)
