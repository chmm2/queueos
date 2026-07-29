# The CI/CD pipeline, explained

This project uses GitHub Actions for continuous integration and continuous
deployment. This document explains **what each piece does and why** — it's
written to be learned from, not just copied.

---

## The mental model

**CI (Continuous Integration)** answers: *"is this change safe?"*
It runs on every push and pull request, and it must be **fast and trustworthy**.

**CD (Continuous Deployment)** answers: *"ship the change that was proven safe."*
It runs only after CI succeeds on `main`.

```
        push / pull request
                │
                ▼
        ┌───────────────┐
        │      CI       │   4 jobs in parallel
        │  ci.yml       │   backend · frontend · ml-service · e2e
        └───────┬───────┘
                │  all green?
                ▼
        ┌───────────────┐
        │   CI passed   │   single gate job (use this in branch protection)
        └───────┬───────┘
                │  only on main
                ▼
        ┌───────────────┐
        │      CD       │   build + push 3 images to ghcr.io
        │  cd.yml       │   then trigger the hosting deploy
        └───────────────┘
```

---

## CI: `.github/workflows/ci.yml`

### Job 1 — `backend`: Jest with a real database

```yaml
services:
  mongo:
    image: mongo:7
```

A **service container** is a sidecar database that lives for the duration of the
job. This is the key trick that lets the *integration* tests run for real in CI:
the suite reads `TEST_MONGO_URI`, so it talks to this throwaway MongoDB instead
of needing an in-memory binary download.

What it proves: the state machine's legal-transition graph, the ETA heuristic,
timezone-correct day boundaries, tenant-isolation helpers, and — the important
one — that **atomic token numbering never collides under 30 concurrent
issuances**.

Other things worth noticing:

| Line | Why it matters |
|---|---|
| `npm ci` (not `npm install`) | Installs exactly what `package-lock.json` pins, so CI is reproducible |
| `cache: npm` | Restores `~/.npm` between runs; installs go from minutes to seconds |
| `node --check` on every file | A dirt-cheap syntax gate that fails before the slower tests |
| `continue-on-error: true` on `npm audit` | Advisory: surfaces vulnerabilities without blocking the pipeline |

### Job 2 — `frontend`: does it still build?

A broken import or a syntax error is the most common way a frontend regresses.
`npm run build` catches both, and the job then asserts `dist/index.html` exists
so a silently-empty build can't pass.

### Job 3 — `ml-service`: pytest on the activation gate

The self-learning ETA is the most subtle part of the system, so it gets real
tests (`ml-service/tests/test_app.py`). They prove:

- With **too few** real visits → the model stays `collecting` (never activates).
- With **learnable** history → it activates and starts serving predictions.
- With **unpredictable** history → activation is **refused** (we never ship an
  ETA we can't back up).
- One org's model **never** serves another org (tenant-isolated learning).
- A malformed request returns **422**, so a contract mismatch fails loudly
  instead of silently producing a wrong number.

`conftest.py` points `MODEL_DIR` at a temp directory so tests never write into
real model storage.

### Job 4 — `e2e`: the whole system, for real

The most valuable job. It runs `docker compose up --build`, waits for every
service to report healthy, seeds the demo org, then runs
`.github/scripts/e2e-api.sh`, which exercises the platform as real users:

1. Admin logs in — and the response carries the **hospital vocabulary** (a
   "counter" must come back as a `Room`).
2. A customer joins with **no account** (the QR flow) and gets a token.
3. They can track **only their own** token (no session → `403`).
4. A duplicate join for the same phone → `409`.
5. Staff **call next** and complete the customer.
6. Completing an already-completed token → `409` (state machine holds).
7. **Tenant isolation**: a freshly-registered second org sees **0** of the first
   org's tokens and gets `404` trying to attach config to its branch.

If this job is green, the system genuinely works end to end — not just its units.

Note `if: failure()` on the log step: it only runs when something broke, which
is exactly when you want the logs. And `if: always()` on teardown guarantees
cleanup even after a failure.

### Job 5 — `ci`: one gate to rule them all

```yaml
needs: [backend, frontend, ml-service, e2e]
```

A summary job that passes only if none of the others failed. Require **this
one** in branch protection rather than listing four job names — then adding a
fifth job later doesn't mean reconfiguring the repo.

### Two settings that matter more than they look

```yaml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```
Push twice in a minute and the first run is cancelled. Saves CI minutes and
stops you waiting on results you no longer care about.

```yaml
permissions:
  contents: read
```
The automatic `GITHUB_TOKEN` starts read-only. Least privilege: CI can read the
repo and nothing else. CD explicitly opts into `packages: write` because it
genuinely needs to publish images.

---

## CD: `.github/workflows/cd.yml`

### Deploying only what CI proved

```yaml
on:
  workflow_run:
    workflows: ['CI']
    types: [completed]
    branches: [main]
```

`workflow_run` fires when CI finishes. The job then checks:

```yaml
if: github.event.workflow_run.conclusion == 'success'
```

`completed` is not the same as `succeeded` — CI "completes" when it fails too.
Without that conclusion check you'd cheerfully deploy a broken build. This is
the single most important line in the file.

It also checks out `github.event.workflow_run.head_sha` — the **exact commit CI
validated**, not whatever happens to be newest on `main`.

### Building three images with a matrix

```yaml
strategy:
  matrix:
    include:
      - { service: backend, context: backend }
      - { service: ml,      context: ml-service }
      - { service: web,     context: frontend }
```

One job definition, three parallel runs. Adding a fourth service is one line.

### Tagging for traceability and rollback

Every image is pushed twice: `:latest` and `:<short-sha>`. The SHA tag means any
running container maps back to an exact commit, and rolling back is just
deploying the previous SHA — no rebuild required.

### Layer caching

```yaml
cache-from: type=gha,scope=${{ matrix.service }}
cache-to: type=gha,scope=${{ matrix.service }},mode=max
```

Docker layers are cached in GitHub's cache. The Python image with scikit-learn
takes minutes to build cold and seconds warm. The per-service `scope` stops the
three builds from evicting each other's cache.

### The deploy step

Render's blueprint already auto-deploys on push to `main`. The hook step exists
for when you'd rather have deploys **gated on CI**: turn off Render's
auto-deploy, add a `RENDER_DEPLOY_HOOK_URL` secret, and this becomes the only
path to production. With no secret set, it logs a message and exits cleanly —
never a red pipeline over an optional integration.

---

## Dependabot: `.github/dependabot.yml`

Weekly PRs for npm (backend + frontend), pip, Docker base images, and the
Actions themselves. Patch/minor updates are **grouped** into one PR to avoid
noise.

The reason this is safe: every Dependabot PR triggers CI, so an upgrade that
breaks the state machine or the build shows up red before you merge it. CI is
what turns dependency updates from a chore into a rubber stamp.

---

## Running it yourself

```bash
# Watch the current run from the terminal
gh run watch

# List recent runs and see what failed
gh run list --limit 5
gh run view --log-failed

# Trigger CI manually (workflow_dispatch)
gh workflow run CI
```

Reproduce CI locally before pushing:

```bash
# backend, exactly as CI runs it
docker run -d --name qtest -p 27019:27017 mongo:7
cd backend && TEST_MONGO_URI=mongodb://localhost:27019/queueos-ci npm test
docker rm -f qtest

# ml-service
cd ml-service && pip install -r requirements-dev.txt && python -m pytest -q

# the full e2e
docker compose up -d --build
docker compose exec -T backend npm run seed
bash .github/scripts/e2e-api.sh
```

---

## Natural next steps

Genuinely useful things to add as you keep learning:

1. **Branch protection** — Settings → Branches → require the `CI passed` check
   before merging to `main`. This is what makes CI *mean* something.
2. **ESLint + Prettier** as a `lint` job — catches style and a class of bugs the
   syntax check can't.
3. **Coverage reporting** — `jest --coverage` plus a threshold, so tests can't
   silently rot.
4. **A staging environment** — deploy `main` to staging automatically, and
   promote to production behind a manual `environment` approval gate.
5. **Container scanning** (e.g. Trivy) on the built images before publishing.
