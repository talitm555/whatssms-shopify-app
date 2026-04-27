# WhatsSMS Shopify app — production deployment

This document describes how the app runs in production on **Ubuntu 24** with **Docker**, **nginx** (TLS + reverse proxy), **PostgreSQL** (shared host or n8n stack), and **GitHub Actions** for CI/CD. The public app URL is **`https://shopify.whatssms.io`** (see [`shopify.app.toml`](shopify.app.toml)).

## Architecture

- **Browser / Shopify** → **nginx** (`shopify.whatssms.io`, TLS) → **`127.0.0.1:3150`** on the host → **Docker** container (`remix-serve`, `PORT=3150`).
- **PostgreSQL**: dedicated database for this app (not n8n’s database name). The app container reaches Postgres on the host via **`host.docker.internal:5432`** when Postgres is published on loopback (see below).
- **Redis**: not used by this app (queues use the **`AsyncJob`** Postgres table; COD rate limits are **in-process** per container).
- **Health**: `GET /health` (process up), `GET /ready` (Postgres `SELECT 1`).

## PostgreSQL next to n8n (Docker Compose)

If Postgres runs in the same stack as n8n **without** `ports:` on the `postgres` service, other compose projects cannot reach it. **Minimal change (recommended):** publish Postgres **only on loopback**:

```yaml
services:
  postgres:
    ports:
      - "127.0.0.1:5432:5432"
```

Then create a **separate database and user** for the Shopify app (e.g. `shopify_whatssms`) via `init-data.sh` or manual SQL; grant that user access only to that database.

**`DATABASE_URL` from the Shopify container** (see [`docker-compose.prod.yml`](docker-compose.prod.yml)):

```text
postgresql://SHOPIFY_DB_USER:SHOPIFY_DB_PASSWORD@host.docker.internal:5432/shopify_whatssms?schema=public
```

Linux Docker 20.10+ provides `host.docker.internal` when `extra_hosts: ["host.docker.internal:host-gateway"]` is set (already in `docker-compose.prod.yml`).

## Server layout

Recommended path (matches CI defaults):

```text
/home/talit/shopify.whatssms.io/    # git clone of this repo (main branch)
  ├── docker-compose.prod.yml
  ├── .env                          # recreated each deploy by GitHub Actions (not committed)
  └── …
```

Permissions: the deploy user must own this directory (or have write access) and be allowed to run `docker compose`.

**One-time server setup**

1. Install Docker Engine + Compose plugin.
2. Clone the repository:  
   `git clone <your-repo-url> /home/talit/shopify.whatssms.io`
3. Ensure `docker-compose.prod.yml` is present at repo root (committed in this project).
4. Configure nginx (see below). You do **not** need to create `.env` by hand if you use the provided deploy workflow; the first successful deploy writes it.

## nginx (TLS → app)

Terminate SSL on nginx and proxy to the bound container port:

```nginx
server {
    listen 443 ssl http2;
    server_name shopify.whatssms.io;

    ssl_certificate     /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3150;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

`X-Forwarded-Proto` and `Host` are important for OAuth and embedded admin URLs. COD pages use `X-Forwarded-For` / `X-Real-IP` for metadata and in-memory rate limits.

## Docker Compose (production)

[`docker-compose.prod.yml`](docker-compose.prod.yml) binds the app to **loopback only**:

- `127.0.0.1:3150:3150`

Set **`SHOPIFY_APP_IMAGE`** to your GHCR image, e.g. `ghcr.io/your-org/your-repo:main`. The deploy workflow writes this into `.env` automatically.

### Optional dedicated `AsyncJob` worker

If you run a **second** service that only polls `processPendingJobs`, set **`DISABLE_ASYNC_JOB_SWEEP=1`** on **both** the web app and the worker so only one mechanism drains jobs (see [`app/lib/jobs.server.ts`](app/lib/jobs.server.ts)).

```bash
docker compose -f docker-compose.prod.yml --profile with-worker up -d
```

When using this profile, add to `.env` (or GitHub **Variables**): `DISABLE_ASYNC_JOB_SWEEP=1`.

## GitHub Actions

- **[`.github/workflows/ci.yml`](.github/workflows/ci.yml)** — on every PR and push to `main`: Postgres service, `prisma migrate deploy`, lint, test, build.
- **[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)** — on push to `main` only:
  1. Build and push the Docker image to **GHCR** (`:main` and `:${{ github.sha }}`).
  2. Run **`shopify app deploy --force`** using a Partner CI token ([Shopify CLI in CI/CD](https://shopify.dev/docs/apps/tools/cli/ci-cd)).
  3. **SSH** to the server: `git pull`, **remove** the old `.env`, write a **new** `.env` from GitHub variables/secrets, `docker login ghcr.io`, `docker compose pull && up -d`.

Whenever you add a new environment variable to the app, update **both** [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) (remote `echo` lines) and your GitHub **Variables** / **Secrets** — you should not need to SSH in only to edit `.env`.

### GitHub **Variables** (repository or organization)

| Variable | Example / purpose |
|----------|-------------------|
| `DEPLOY_HOST` | Server hostname or IP |
| `DEPLOY_USER` | SSH user (e.g. `talit`) |
| `DEPLOY_PATH` | App directory, e.g. `/home/talit/shopify.whatssms.io` |
| `DEPLOY_SSH_PORT` | SSH port (optional; default `22`) |
| `SHOPIFY_API_KEY` | Partner Dashboard API key |
| `SCOPES` | Same as `shopify.app.toml` / `.env.example` |
| `SHOPIFY_APP_URL` | `https://shopify.whatssms.io` (no `/app` suffix) |
| `WHATSSMS_API_BASE_URL` | e.g. `https://app.whatssms.io` |
| `PORT` | `3150` |
| `GHCR_USERNAME` | GitHub username for `docker login ghcr.io` (must match PAT owner) |
| `DISABLE_ASYNC_JOB_SWEEP` | Optional: `1` when using the compose **with-worker** profile |

### GitHub **Secrets**

| Secret | Purpose |
|--------|---------|
| `DATABASE_URL` | Full Postgres URL (includes password) |
| `SHOPIFY_API_SECRET` | Partner Dashboard API secret |
| `APP_ENCRYPTION_SECRET` | Optional; 32+ chars for AES-256-GCM (omit if you rely on API secret) |
| `SHOPIFY_CLI_PARTNERS_TOKEN` | For `shopify app deploy` ([create token](https://shopify.dev/docs/apps/tools/cli/ci-cd)) |
| `DEPLOY_SSH_PRIVATE_KEY` | Private key for SSH (PEM) |
| `GHCR_PULL_TOKEN` | Fine-grained PAT with **read:packages** so the server can `docker pull` from GHCR |
| `GITHUB_TOKEN` | Provided automatically; workflow uses it to **push** images (needs `packages: write`) |

### GHCR pull from the server

The deploy user runs `docker login ghcr.io` using **`GHCR_PULL_TOKEN`** and **`GHCR_USERNAME`**. Create a PAT with **read:packages** for the account that can read the package (often your GitHub user).

### Shopify `shopify app deploy`

Requires `SHOPIFY_CLI_PARTNERS_TOKEN`. The workflow runs from the repo root so [`shopify.app.toml`](shopify.app.toml) and extensions stay in sync with the Partner app.

## Environment variables (runtime)

Aligned with [`.env.example`](.env.example):

| Variable | Notes |
|----------|--------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | PostgreSQL |
| `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` | OAuth |
| `SCOPES` | Comma-separated |
| `SHOPIFY_APP_URL` | Public origin without `/app` |
| `PORT` | `3150` inside container |
| `WHATSSMS_API_BASE_URL` | WhatsSMS API host |
| `APP_ENCRYPTION_SECRET` | Recommended in production |
| `SHOPIFY_APP_IMAGE` | Used by `docker-compose.prod.yml` |
| `DISABLE_ASYNC_JOB_SWEEP` | `1` when using external worker only |
| `COD_RATE_LIMIT_READ_PER_MIN` / `COD_RATE_LIMIT_WRITE_PER_MIN` | Optional overrides for public COD routes |

## COD rate limits

Defaults: **120** GET-equivalent reads/min and **40** POST decisions/min per client IP (from `X-Forwarded-For` / `X-Real-IP`). In-memory only: if you scale to **multiple** app replicas, each has its own counters; use nginx rate limiting or a shared store if you need a global cap.

## Operational notes

- **Migrations** run on container start via `npm run setup` (`prisma migrate deploy`).
- **Backups**: back up the dedicated Postgres database regularly.
- **Secrets rotation**: update GitHub Secrets and re-run deploy (or push to `main`).

## Related docs

- Local move from old SQLite dev DB: [`MIGRATION_SQLITE_TO_POSTGRES.md`](MIGRATION_SQLITE_TO_POSTGRES.md).
- Developer overview: [`README.md`](README.md).
