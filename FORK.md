# FORK.md — Knight1988/dockge

## Upstream Project

| Field | Value |
|---|---|
| **Upstream repo** | https://github.com/louislam/dockge |
| **Upstream author** | louislam |
| **Project** | Dockge — a self-hosted Docker Compose stack manager |
| **Version forked** | 1.5.0 |
| **Fork point commit** | `f809ae1` — "fixed missed v-html xss warning vulnerability" (2026-04-18) |
| **This fork** | https://github.com/Knight1988/dockge |
| **Fork author** | Squall Leonhart (Knight1988) |

> **Sync status (as of 2026-06-15):** This fork is at parity with upstream `master` at the fork point — upstream has not advanced beyond `f809ae1`.

---

## What is Dockge?

Dockge is a fancy, easy-to-use, reactive self-hosted Docker Compose stack manager with a Vue 3 web UI. It lets you create, edit, start, stop, restart, and delete `compose.yaml` stacks through a browser interface, with real-time terminal output and progress streaming via Socket.IO.

**Tech stack:** Node.js (≥ 22.14) · TypeScript · Express · Socket.IO · SQLite (via redbean-node/knex) · Vue 3 · Bootstrap · Vite

---

## Changes in This Fork

This fork adds **3 commits** on top of the upstream fork point:

---

### 1. `b15d2ea` — Access Token API, Settings UI, and publish.sh
> *2026-06-15 · 685 additions across 10 files*

The headline feature: a machine-friendly **REST API** authenticated via long-lived **Bearer access tokens**, plus a UI to manage them and a publish script for the Docker image.

#### Backend — Database

**`backend/migrations/2026-06-13-0000-access-token-table.ts`** *(new)*
- Knex migration creating the `access_token` table with columns:
  `id`, `user_id` (FK → `user.id` CASCADE DELETE), `name`, `token` (unique SHAKE-256 hash), `created_date`, `last_used_date`, `active`

**`backend/models/access-token.ts`** *(new)*
- `AccessToken` redbean-node model with three static methods:
  - `hashToken(plaintext)` — SHAKE-256 hash for safe storage
  - `create(userID, name)` — generates a `dockge_<40-char-random>` token, stores its hash, returns the plaintext (shown once)
  - `getUserIDByToken(plaintext)` — validates a bearer token, updates `last_used_date`, returns `userID` or `null`
  - `toPublicJSON()` — safe serialisation (no token hash exposed)

#### Backend — REST Router

**`backend/routers/api-router.ts`** *(new)*
- `ApiRouter` class, mounted at `/api`
- **Auth middleware:** requires `Authorization: Bearer <token>` on all routes; returns 401 on failure
- **Routes:**

  | Method | Path | Description |
  |---|---|---|
  | `PUT` | `/api/stacks/:name` | Save/overwrite a stack's `compose.yaml` (and optional `.env`) without redeploying |
  | `POST` | `/api/stacks/:name/start` | Start a stack (`docker compose up -d --remove-orphans`) |
  | `POST` | `/api/stacks/:name/stop` | Stop a stack (`docker compose stop`) |
  | `POST` | `/api/stacks/:name/restart` | Restart a stack (`docker compose restart`) |
  | `POST` | `/api/stacks/:name/update` | Pull new images and redeploy (`docker compose pull` + `up -d`) |

- Uses a minimal `DockgeSocket` stub (`makeApiSocket`) so stack operations work without a real WebSocket client
- Error mapping: `ValidationError` → 400/404, conflict → 409, unknown → 500

**`backend/dockge-server.ts`** *(modified)*
- Registers `ApiRouter` with the server

**`backend/router.ts`** *(modified)*
- Exports router base type used by `ApiRouter`

#### Backend — Socket Handlers

**`backend/socket-handlers/main-socket-handler.ts`** *(modified)*
- Adds three authenticated socket events for token management:
  - `listAccessTokens` → returns all tokens for the logged-in user (public JSON, no hashes)
  - `createAccessToken(name)` → creates a new token, returns the plaintext **once**
  - `revokeAccessToken(id)` → sets `active = false` (soft-delete) on a token owned by the user

#### Frontend — Settings Page

**`frontend/src/components/settings/AccessTokens.vue`** *(new)*
- Bootstrap-styled settings panel with:
  - **Create token** form (name input + submit)
  - **One-time reveal** alert box with copy-to-clipboard button after creation
  - **Usage hint** showing a `curl` example with Bearer auth
  - **Token table** listing all tokens (name, created date, last used date) with per-row **Revoke** button (confirmed via `<Confirm>` modal)

**`frontend/src/pages/Settings.vue`** *(modified)*
- Adds "Access Tokens" tab to the Settings sidebar

**`frontend/src/router.ts`** *(modified)*
- Registers the `/settings/access-tokens` route

**`frontend/src/lang/en.json`** *(modified)*
- Adds i18n keys: `AccessTokens`, `CreateToken`, `TokenName`, `RevokeToken`, `NoTokens`, `CopyToken`, `tokenCreatedOnce`, `confirmRevokeToken`, `APIUsageHint`

#### Build / Publish

**`publish.sh`** *(new)*
- Shell script to build and push `knight1988/dockge` multi-arch images to Docker Hub
- Builds its own `:base` and `:build-healthcheck` base images without modifying upstream Dockerfiles (uses `--build-context` overrides)
- Publishes to `linux/amd64`, `linux/arm64`, `linux/arm/v7`
- Options: `--skip-base` (skip base image rebuild), `--version X.Y.Z` (override version tag)
- Environment overrides: `IMAGE`, `PLATFORMS`, `VERSION`

---

### 2. `e598fae` — Fix API Router Intercepting Static Asset Requests
> *2026-06-15 · 3 files changed, 12 additions / 6 deletions*

**Problem:** The initial API router was registered at the root path, causing its Bearer-token auth middleware to intercept all requests — including frontend static assets — and return 401.

**Fix:** Mount `ApiRouter` explicitly at `/api` so its middleware only fires for `/api/*` routes. Frontend static file serving is unaffected.

Files changed: `backend/dockge-server.ts`, `backend/router.ts`, `backend/routers/api-router.ts`

---

### 3. `ab56b35` — Gitignore and components.d.ts Housekeeping
> *2026-06-15 · 2 files changed, 2 additions / 6 deletions*

- **`.gitignore`** — adds `.playwright-mcp/` (Playwright MCP tool working directory) to the ignore list
- **`frontend/components.d.ts`** — removes stale auto-generated component type declarations left over from development

---

## Files Added by This Fork

| File | Purpose |
|---|---|
| `backend/migrations/2026-06-13-0000-access-token-table.ts` | DB migration for `access_token` table |
| `backend/models/access-token.ts` | AccessToken model (create / validate / revoke) |
| `backend/routers/api-router.ts` | REST API router with Bearer auth |
| `frontend/src/components/settings/AccessTokens.vue` | Settings UI for managing access tokens |
| `publish.sh` | Multi-arch Docker build & publish script for `knight1988/dockge` |

## Files Modified by This Fork

| File | Change summary |
|---|---|
| `backend/dockge-server.ts` | Register `ApiRouter` |
| `backend/router.ts` | Export router base; set mount path |
| `backend/socket-handlers/main-socket-handler.ts` | Add `listAccessTokens`, `createAccessToken`, `revokeAccessToken` socket events |
| `frontend/src/lang/en.json` | Add access token i18n keys |
| `frontend/src/pages/Settings.vue` | Add "Access Tokens" settings tab |
| `frontend/src/router.ts` | Register `/settings/access-tokens` route |
| `.gitignore` | Ignore `.playwright-mcp/` |
| `frontend/components.d.ts` | Remove stale generated entries |

---

## Docker Image

This fork publishes to Docker Hub as **`knight1988/dockge`** (instead of `louislam/dockge`).

```bash
# Run the fork image
docker run --rm -p 5001:5001 --name dockge knight1988/dockge:latest
```

Use `publish.sh` to build and push a new release:

```bash
./publish.sh                   # full build (includes base images)
./publish.sh --skip-base       # faster: skip base layer rebuild
./publish.sh --version 1.5.1   # override version tag
```

---

## Keeping in Sync with Upstream

```bash
# Add upstream once (if not already present)
git remote add upstream https://github.com/louislam/dockge.git

# Pull upstream changes
git fetch upstream
git rebase upstream/master    # or: git merge upstream/master
```

---

## API Usage (Quick Reference)

All REST endpoints require a Bearer token obtained from **Settings → Access Tokens** in the UI.

```bash
BASE=https://your-dockge-host

# Save a compose file (no redeploy)
curl -X PUT "$BASE/api/stacks/mystack" \
  -H "Authorization: Bearer dockge_<token>" \
  -H "Content-Type: application/json" \
  -d '{"composeYAML": "services:\n  app:\n    image: nginx\n"}'

# Start / stop / restart / update a stack
curl -X POST "$BASE/api/stacks/mystack/start"   -H "Authorization: Bearer dockge_<token>"
curl -X POST "$BASE/api/stacks/mystack/stop"    -H "Authorization: Bearer dockge_<token>"
curl -X POST "$BASE/api/stacks/mystack/restart" -H "Authorization: Bearer dockge_<token>"
curl -X POST "$BASE/api/stacks/mystack/update"  -H "Authorization: Bearer dockge_<token>"
```

All responses: `{ "ok": true }` on success, `{ "ok": false, "msg": "..." }` on error.
