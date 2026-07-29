# QueueOS — Multi-Tenant Queue-as-a-Service Platform

A production-style, **multi-tenant** queue management platform that any
business — hospital, bank, restaurant, government office, pharmacy, salon —
can sign up for and run its own queues in minutes. Every industry is
**configuration, not a code fork**: one codebase, driven by data.

Customers join a queue by scanning a QR code (no app install), track their
live position and ETA, and get called through a strict lifecycle state
machine. Staff run counters from a console; admins configure everything and
see analytics. A separate ML microservice predicts wait times without ever
blocking the real-time server.

## Stack

- **Frontend:** React (Vite), Zustand, Socket.IO client, Recharts — plus a public, no-login customer web app (join / track / display board)
- **Backend:** Node.js, Express, Socket.IO, MongoDB (Mongoose), JWT (access + refresh, revocable), RBAC, Helmet, rate limiting
- **ML service:** Python, **FastAPI + Pydantic**, scikit-learn (Random Forest regression)
- **Deploy:** Docker + Docker Compose (Mongo + ML + backend + nginx frontend)

## What makes it multi-tenant

Every document belongs to exactly one `Organization`, and **no query ever
crosses that boundary**:

- `req.orgId` is set **only** from the verified JWT — never from the request body.
- Every tenant route filters by it (`scoped(req, …)`) and every fetched
  resource is checked against it (`assertSameOrg`), returning 404 (not 403)
  so ids in other tenants aren't even revealed to exist.
- Email is unique **per organization**, so the same person can be a customer
  at two different orgs.

## How the pieces fit together

```
  Customer phone ─┐                         ┌─ Staff console / Admin
   (QR web app)   │   REST + WebSocket       │   (React + Zustand)
                  ▼                          ▼
            ┌──────────────────────────────────┐
            │  Backend (Express + Socket.IO)    │
            │  tenancy · auth · queue engine    │
            └───────┬───────────────┬──────────┘
                    │               │ HTTP (short timeout, non-blocking)
              ┌─────▼─────┐   ┌─────▼──────────┐
              │ MongoDB   │   │ ML service     │
              │ (tenant   │   │ FastAPI + RF   │
              │  data)    │   │ ETA prediction │
              └───────────┘   └────────────────┘
```

The backend never runs the model in-process — it calls FastAPI over HTTP with
a 1.5s timeout and falls back to a heuristic if that's slow or down. A slow
model can't freeze Socket.IO updates for everyone connected to the queue.
Because FastAPI validates the request with Pydantic, a contract mismatch
fails loudly (422) instead of silently using a wrong default.

## Quick start — Docker (recommended)

```bash
docker compose up --build          # starts mongo, ml, backend, frontend
docker compose exec backend npm run seed   # demo org + one user per role
```

Then open **http://localhost:8080**.

Seeded org: **Demo City Clinic** (hospital template). Logins (all `password123`):

| Role | Email | Sees |
|---|---|---|
| Admin | admin@queue.com | Whole org: config + analytics |
| Operator | operator@queue.com | One branch: counters + staff |
| Staff | staff@queue.com | Their counter: call/serve tokens |

The seed prints the branch id and the two public URLs:

- **Customer join:** `/join/<slug>/<branchId>` (what the QR points to)
- **Display board:** `/board/<branchId>` (the waiting-room screen)

## Manual setup (without Docker)

<details>
<summary>Run each service directly</summary>

**1. ML service (FastAPI)**
```bash
cd ml-service
pip install -r requirements.txt
python train.py                 # trains eta_model.joblib on synthetic data
uvicorn app:app --port 6000     # docs at http://localhost:6000/docs
```

**2. Backend**
```bash
cd backend
cp .env.example .env            # set JWT_SECRET, MONGO_URI, etc.
npm install
npm run seed                    # demo org + logins
npm run dev                     # http://localhost:5000
```

**3. Frontend**
```bash
cd frontend
npm install
npm run dev                     # http://localhost:5173
```
</details>

## Customer flow (no app install)

1. Scan the branch QR → opens the join page. The QR carries a **short-lived
   signed token** that rotates on the display, so a screenshot shared later
   fails validation (anti-cheat).
2. Pick a service, enter name/phone (OTP if the org requires it), optionally
   confirm location (geofence if required).
3. Get a token → live tracking page shows position, ETA, and a big **"Your
   turn"** when called. Customer can cancel their own token.

Anti-cheat is **configurable per organization** (`settings.requireOtp`,
`requireGeofence`, `qrRotationSeconds`) plus built-in duplicate detection
(one active token per phone per branch) and rate limiting.

## Token lifecycle (state machine)

```
waiting ──> serving ──> completed
   │           │
   │           ├──> held ────> serving | (auto) missed
   │           └──> skipped ──> serving | (auto) missed
   └──> cancelled
```

Enforced in `backend/src/services/tokenStateMachine.js` — any other
transition is a 409, and every valid transition writes an `AuditLog`. A
background **auto-miss sweeper** marks held/skipped no-shows missed once their
recall window expires (so "no-show workflows" run on their own, not by hand).

## Physical areas: per-zone screens & QRs

Consultation and Pharmacy are in different parts of a building, so each area
gets **its own waiting screen and its own QR** — not one branch-wide pair:

- **Zones** (`models/Zone.js`) group one or more services into a physical area
  (e.g. a "Diagnostics" zone bundling Lab + X-Ray). One zone per service is
  auto-seeded from the template; admins can merge/rename them.
- **Scoped QR** — a zone/service QR encodes `?zone=` / `?service=`, so scanning
  the Pharmacy code opens a join page that says "Join the Pharmacy queue" and
  skips service selection entirely.
- **Scoped board** — `/board/:branchId?zone=<id>` shows only that area's
  services, so the Pharmacy screen never shows Consultation.
- Pick the area (whole branch / a zone / a service) on the console's
  **Displays & QR** page to get that area's QR and screen link.

## Speaks each industry's language

The UI relabels itself from the org's industry, so it never says the wrong
word. A hospital sees **Rooms / Departments / Patients**; a restaurant sees
**Stations / Guests**; a government office sees **Windows / Applicants**; a
salon sees **Stations / Clients**. Defined in
`backend/src/config/terminology.js`, seeded on signup, and applied everywhere
via `frontend/src/lib/terms.js`. Roles are explained in plain English too
(Admin = "Administrator, runs the whole organization", Operator = "Branch
Manager", Staff = "Front-desk Agent").

## Self-learning ETA (no synthetic data, ever)

The wait-time model learns each organization's real rhythm from its own data —
nothing synthetic is ever used:

- **Day 0** — ETA is a transparent heuristic (queue position × service time ÷
  open counters), and that service time **self-calibrates** from the *measured*
  duration of real completed visits (`completedAt − startedAt`).
- **Every completed visit** becomes one labeled training example: the feature
  vector snapshotted at issue time (`Token.etaFeatures`) plus the measured
  actual wait.
- **A scheduler** (`services/trainingService.js`) gathers each org's real
  history and asks the FastAPI service to train a per-organization Random
  Forest, evaluated on the org's own held-out data.
- **Activation gate** — the smart model goes live *only* when it's accurate on
  that holdout (≥70% of predictions within 3 min or 20%). Until then the
  heuristic serves and the console shows a "Learning" progress bar. Once live,
  new tokens carry `etaSource: 'model'`.

The ML service ships with **no model** and stores per-org models under a
persisted volume. Admins can watch progress (or force a retrain) on the
Analytics page's **Smart ETA** panel.

## Notifications (email · WhatsApp · SMS)

One event fans out to every configured channel — a customer gets "you joined",
"it's your turn", and "missed" messages. Email works via SMTP; **WhatsApp and
SMS work via Twilio** — set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
`TWILIO_SMS_FROM`, `TWILIO_WHATSAPP_FROM` and those channels light up
automatically (they're skipped, not errored, when unset). Every send is
recorded in a `Notification` outbox. Adding a new provider is a new adapter in
`notificationService.js`, not a change to any caller.

## Configuration = every industry, no code changes

Signing up with an industry seeds a working template (branch + services +
counters). A **Service** row is the unit of configuration — its own token
prefix, queue type (walk-in / appointment / vip / emergency), priority
weight, SLA and average service time. Hospital, bank, restaurant, government,
pharmacy and salon templates ship in
`backend/src/services/templateService.js`.

## Key production concerns handled

- **Tenant isolation** on every route (the core multi-tenant guarantee)
- **Atomic token numbering** (`TokenSequence`) — no duplicate `A-014` under load
- **Race-safe "call next"** — two staff can't grab the same token
- **Ownership-checked cancel/track** — a customer can only touch their own token
- **Timezone-correct** daily numbering (per-branch, not server time)
- **Revocable JWTs** — access + refresh, `tokenVersion` invalidates sessions
- **Helmet + rate limiting + input validation** on auth and public routes
- **ETA contract validated** by Pydantic (no more silent wrong defaults)

### Hardening for "all situations"

- **Async-error safe** — `express-async-errors` routes every thrown/rejected
  handler to the error handler, so a bad request can't hang or crash the process
- **Fail-fast config** — refuses to boot with a missing/weak `JWT_SECRET`; warns
  on dev defaults and open CORS in production (`config/env.js`)
- **Graceful shutdown** — on `SIGTERM`/`SIGINT` it stops the sweeper, drains
  Socket.IO + HTTP, and closes Mongo cleanly (container/k8s friendly)
- **Liveness + readiness** — `/health` (is the process up) and `/ready` (are
  Mongo + ML reachable) for load balancers and orchestrators
- **Safe errors** — 5xx responses return a generic message; stack traces are
  logged, never leaked to callers
- **Non-root container** — backend runs as the `node` user under `tini` for
  correct signal handling
- **Resilient DB** — connection timeouts + reconnect logging; ML failures fall
  back to a heuristic instead of erroring the queue

### The console (staff/admin UI)

Everyone signs in at `/login`; the app routes by role into one console with a
sidebar and a branch switcher:

- **Admin** → Overview, Counter caller, Branches, Services, Counters, Staff, Analytics, Displays & QR
- **Operator** → Overview, Counter caller, Counters, Staff, Analytics, Displays & QR
- **Staff** → **Counter caller** (call next / hold / skip / complete) + Displays & QR

Start a brand-new org anytime at `/signup` (pick an industry, get a working
queue instantly).

## Tests

```bash
cd backend
npm test              # unit + integration (22 tests, 5 suites)
npm run test:unit     # pure logic only, no database needed
```

Unit tests cover the state-machine legality graph, the ETA heuristic,
timezone-correct day boundaries, tenant-isolation helpers, and industry
terminology. Integration tests run against MongoDB and prove **atomic token
numbering never collides under 30 concurrent issuances** and that **state
transitions write audit logs while illegal transitions are rejected (409) with
no state change**.

Integration tests use an in-memory MongoDB by default; in a sandbox that can't
download the mongod binary, point them at a throwaway database instead:

```bash
docker run -d --name qtest -p 27019:27017 mongo:7
TEST_MONGO_URI=mongodb://localhost:27019/queue-test npm test
docker rm -f qtest
```

## Roadmap / next steps

- Redis adapter for Socket.IO (horizontal scaling past one Node instance)
- SMS / WhatsApp / push notification adapters (interface is already in place)
- Real historical training data for the ETA model (swap synthetic in `train.py`)
- Automated tests (state machine + token routes are the highest-value targets)
```
