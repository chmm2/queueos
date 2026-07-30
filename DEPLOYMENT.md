# Deploying QueueOS as a real website

Fastest way to a shareable public URL (free): the **Render blueprint** below.
Prefer your own server/domain? Skip to **Path A** (VPS).

---

## Fastest — Render blueprint + MongoDB Atlas (free, ~10 min)

The repo ships a `render.yaml` that defines all three services (ML, API,
frontend). Cross-service URLs and the JWT secret are wired automatically — the
**only** value you paste is the database connection string.

**Step 1 — free database (MongoDB Atlas).**
1. Sign up at mongodb.com/atlas → create a free **M0** cluster.
2. Database Access → add a user (username + password).
3. Network Access → allow `0.0.0.0/0` (any IP), so Render can connect.
4. Connect → Drivers → copy the connection string. It looks like
   `mongodb+srv://USER:PASS@cluster0.xxxx.mongodb.net/queueos`
   (add `/queueos` before the `?` to name the database).

**Step 2 — deploy on Render.**
1. Sign up at render.com and connect your GitHub.
2. **New → Blueprint** → pick the `queueos` repo → Apply.
3. Render reads `render.yaml` and creates `queueos-ml`, `queueos-api`,
   `queueos-web`. When it asks for **MONGO_URI** (on `queueos-api`), paste the
   Atlas string from Step 1.
4. Wait for all three to go live (first build ~5 min; free services cold-start
   after idle).

**Step 3 — seed a demo (optional).**
On the `queueos-api` service → **Shell** tab:
```bash
npm run seed
```
Then open the `queueos-web` URL → sign in with the **Admin** demo button.

> Free services sleep after ~15 min idle and cold-start on the next request —
> fine for a portfolio demo. Upgrade a service to a paid plan for always-on.

---

## Deploying a new version

Render's blueprint watches `main`, so **pushing is the deploy** — the three
services rebuild automatically. `git push` and watch the dashboard; a build
takes about five minutes.

### When the data model changed

If a release changes the shape of the database (renaming a collection, adding
a unique field), the existing data and its indexes no longer fit and the app
will fail in confusing ways — a login that hangs, a 500 on issuing a token, an
index build that aborts. The fix is to reset the database.

`npm run seed` does exactly that: it clears every collection, reconciles the
indexes with the current schemas, and recreates the demo organization. Because
Render's free tier has no Shell, run it **from your machine, pointed at
Atlas**:

```bash
cd backend
MONGO_URI="mongodb+srv://USER:PASS@cluster0.xxxx.mongodb.net/queueos" npm run seed
```

In PowerShell:

```powershell
cd backend
$env:MONGO_URI="mongodb+srv://USER:PASS@cluster0.xxxx.mongodb.net/queueos"; npm run seed
$env:MONGO_URI=$null   # so later local runs go back to your local database
```

> **This erases everything in that database.** It's the right move for a demo
> or a schema change, and the wrong move once real customers are in there — at
> that point you'd write a migration instead.

The seed prints the admin login and the generated **counter credentials**.
Counter passwords are only ever shown once, so copy them before closing the
terminal (an admin can always issue new ones from Rooms & Counters).

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
