# WhatsSMS — Shopify public app

Embedded Shopify admin app (Remix + Polaris + App Bridge) that connects a merchant’s [WhatsSMS](https://whatssms.io) account for SMS (Android / gateway) and WhatsApp messaging via the **WhatsSMS REST API** documented in the merchant dashboard (`/dashboard/docs`).

## Features

- **OAuth + offline sessions** via `@shopify/shopify-app-remix` (App Store distribution).
- **WhatsSMS API key** stored **encrypted at rest** (AES-256-GCM; key from `APP_ENCRYPTION_SECRET`; local development can fall back to `SHOPIFY_API_SECRET`).
- **Admin navigation**: Connection (API key validation only), Senders (default SMS/WhatsApp devices), Placeholders (template variable reference), COD Confirmations, Customer Notifications (per–webhook-topic automations), About.
- **Connection**: first-time API key capture (host from `WHATSSMS_API_BASE_URL` only). The app validates keys with `GET /api/get/shorteners` (requires **get shorteners** permission on the key); it does **not** display credits, subscription tier, or usage — the Shopify app itself has **no** fee or paywall.
- **Customer Notifications**: one saved rule per event type (Shopify topics: `customers/create`, `checkouts/update` for abandoned cart recovery, `orders/create`, `orders/paid`, `orders/cancelled`, `fulfillments/create`, `fulfillments/update`, plus app event **Order confirmed** driven by `orders/updated` when confirmation tags are present) with SMS / WhatsApp channels and templates (consent-aware when Shopify includes SMS marketing fields on order payloads). **Abandoned cart** uses Shopify’s recovery URL on `checkouts/update`, but the app **defers sending** until **N minutes after the last checkout update** (merchant-configurable when creating or editing that notification) and **cancels** the pending message if the checkout completes.
- **COD confirmation**: on qualifying orders, sends SMS and/or WhatsApp with a **public, time-limited** link on this app (`/cod/:token?c=sms|whatsapp`). The public page shows order details; **confirm** or **reject** applies tags (`confirmed_via_*` / `rejected_via_*`), appends an **order note** with IP/UA metadata, and **reject** triggers `orderCancel` (reason `CUSTOMER`, notify customer, no auto-refund, restock) when Shopify allows cancellation.
- **Webhooks**: HMAC verification via `authenticate.webhook`, idempotency via `X-Shopify-Webhook-Id` (stored in `WebhookReceipt`).
- **Queue**: `AsyncJob` table in **Postgres** + `setImmediate` worker for follow-up work; a lightweight **15s sweep** also runs in the Node process so deferred jobs (abandoned checkout) execute when `runAfter` passes without another webhook. Optional dedicated **worker** container can run `processPendingJobs` on an interval (see [`DEPLOYMENT.md`](DEPLOYMENT.md)). At very large scale, consider SQS/pg-boss/Cloud Tasks.
- **GDPR / compliance**: `customers/data_request`, `customers/redact`, `shop/redact` handlers.

## WhatsSMS API (verified paths)

Base URL defaults to `https://app.whatssms.io` (override with `WHATSSMS_API_BASE_URL`). Paths use the dashboard contract, e.g.:

- `GET /api/get/shorteners?secret=…` (used only to verify the API key on Connection save/load)
- `GET /api/get/devices?secret=…`
- `GET /api/get/wa.accounts?secret=…`
- `POST /api/send/sms` (form body + `secret` in query)
- `POST /api/send/whatsapp` (multipart + `secret` in query)

Authentication uses the **`secret`** query parameter (API key from Tools → API Keys).

## Inbound replies (SMS / WhatsApp)

1. **Primary flow for COD**: the public `/cod/...` link (above) does not depend on inbound parsing.
2. **Keyword replies (YES/NO)**: configure keyword flows in the **WhatsSMS dashboard** (flows / auto-replies) if your plan supports them; map keywords to webhook URLs or internal actions there.
3. **Polling (API)**: the docs expose `GET /api/get/sms.received` and `GET /api/get/wa.received` for received messages. This app does **not** poll by default; run a cron/worker that calls those endpoints and reconciles state if you need polling-based reply handling.

## Setup

### Development vs production URLs

| Environment | App URL (browser / `SHOPIFY_APP_URL`) | Config file |
|-------------|----------------------------------------|-------------|
| **Development** | `https://shopify.talitmahmood.com` — set **`SHOPIFY_APP_URL`** to that origin (no `/app` path). Partner **`application_url`** should be `https://shopify.talitmahmood.com/app` so the iframe loads `/app`. | `shopify.app.dev.toml` (gitignored; copy from `shopify.app.dev.toml.example`) |
| **Production** | `https://ecom.whatssms.io` — same pattern: **`application_url`** = `https://ecom.whatssms.io/app` in `shopify.app.toml`. | `shopify.app.toml` |

**Local dev workflow**

1. **Cloudflare Tunnel** exposes your machine to **`https://shopify.talitmahmood.com`** and forwards HTTP to **`127.0.0.1:3150`** (fixed port; override with `PORT` in `.env` if you change it).
2. **`.env`**: set `PORT=3150` and `SHOPIFY_APP_URL=https://shopify.talitmahmood.com` so Vite HMR matches the hostname you use in the browser.
3. Run **`npm run dev`** or, if you pass **`--tunnel-url`**, use **`https://<your-tunnel-host>:<LOCAL_PORT>`** where **`LOCAL_PORT` matches `--localhost-port`** (e.g. **3150**). The CLI requires a `:port` in the URL, and it uses that port to **listen locally** — do **not** use **`:443`** here (binding to port 443 needs root and causes `EACCES` on macOS). Merchants still use normal HTTPS on 443 via Cloudflare; only this flag’s port is local.

   ```bash
   shopify app dev --config shopify.app.dev.toml --localhost-port 3150 --tunnel-url https://shopify.talitmahmood.com:3150
   ```

   Often you can **omit `--tunnel-url`** and rely on `shopify.app.dev.toml` + your running Cloudflare tunnel to `127.0.0.1:3150`.
4. Open the app **only** via **`https://shopify.talitmahmood.com`** (embedded admin or that URL). Do not rely on `https://localhost:…` for this project’s dev setup.

Under **`[auth].redirect_urls`** in the dev TOML, include **`https://shopify.talitmahmood.com/auth/callback`** and **`https://shopify.talitmahmood.com/auth/session-token`** (same host as `application_url`).

**Production:** keep **`application_url = "https://ecom.whatssms.io/app"`** in committed `shopify.app.toml`. Deploy with `shopify app deploy`.

### Requirements

- Node **22 LTS** for Docker and GitHub Actions; `package.json` engines allow `>=20.19` or `>=22.12`.
- **PostgreSQL** for the database (local, CI, and production).
- Shopify Partner app + CLI (`shopify app dev`).

### Environment

Copy `.env.example` to `.env` and fill:

| Variable | Purpose |
|----------|---------|
| `PORT` | Local port Vite binds to (default **3150**). Cloudflare Tunnel should forward to `http://127.0.0.1:$PORT`. Also passed to `shopify app dev --localhost-port` via `npm run dev`. |
| `DATABASE_URL` | **PostgreSQL** connection string (local, Docker, or production). |
| `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` | From Partner Dashboard. |
| `SCOPES` | Must match `shopify.app.toml` (orders, customers, checkouts, fulfillments read). |
| `SHOPIFY_APP_URL` | Public HTTPS URL of the app (tunnel in dev). |
| `APP_ENCRYPTION_SECRET` | Strong secret for encrypting WhatsSMS API keys. Required in production. |
| `SHOPIFY_APP_STORE_LISTING_URL` | Public Shopify App Store listing URL used by non-embedded landing pages. |
| `WHATSSMS_API_BASE_URL` | WhatsSMS API host if not using the default. |

### Install & DB

```bash
npm install
cp .env.example .env
# set DATABASE_URL, SHOPIFY_*, etc.
npx prisma migrate deploy
npm run dev
```

### Protected customer data (required for `shopify app dev`)

If dev preview fails with:

`This app is not approved to subscribe to webhook topics containing protected customer data`

then Shopify has not yet allowed this app to register webhooks whose payloads include customer-related data (`orders/*`, `customers/*`, `checkouts/*`, compliance topics). That is expected until you configure **Protected customer data** in the Partner Dashboard.

Do this once per app (dev stores do **not** require App Store review; see [Work with protected customer data](https://shopify.dev/docs/apps/launch/protected-customer-data)):

1. In [Partner Dashboard](https://partners.shopify.com) → **Apps** → **WhatsSMS** (your app).
2. Ensure a **distribution method** is selected for the app (required before PCD requests).
3. Open **API access requests** (or **API access** in the app sidebar, depending on UI).
4. Under **Protected customer data access**, choose **Request access**.
5. Select **Protected customer data**, describe why the app needs it (e.g. order notifications, COD SMS, abandoned checkout), and **Save**.
6. If you use **name, address, phone, or email** (this app does for messaging), select those **protected customer fields**, add reasons, and **Save**.
7. Complete **Data protection details** as prompted. For apps used only on a **development store**, you can use customer data in development after these steps without submitting the full app for review.

Then run `shopify app dev` again. If webhooks were partially registered before, reinstall the app on the dev store or run `shopify app deploy` so subscriptions match `shopify.app.toml`.

### Tests

```bash
npm test
```

Covers Shopify webhook HMAC verification helpers and COD detection / tag naming.

### npm audit & install warnings

- **`npm audit`**: `package.json` **overrides** pin patched transitive versions (`esbuild`, `lodash`, `minimatch`, `tar`, `cacache`, `estree-util-value-to-estree`, etc.). After `npm install`, you should see **0 vulnerabilities**.
- **`.npmrc`**: `legacy-peer-deps=true` avoids noisy **ERESOLVE** / optional-peer issues between Vite and `@types/node` (common with Remix + npm 10+). It does not change the security posture of the resolved tree.
- **Deprecation warnings** (`inflight`, old `glob` via ESLint’s dependency chain): come from **`@remix-run/eslint-config`** → ESLint 8. Clearing them fully means migrating to **ESLint 9** + flat config when Remix’s official config supports it, or replacing the dev ESLint preset. They do not affect production runtime bundles.

## Shopify scopes (`shopify.app.toml`)

Default scopes:

`read_orders,write_orders,read_customers,read_checkouts,read_fulfillments`

- **write_orders** — order tags, COD notes, and `orderCancel` on customer reject.
- **read_checkouts** — `checkouts/update` abandoned cart recovery notifications.
- **read_fulfillments** — `fulfillments/create` and `fulfillments/update` customer notifications.

After changing scopes, merchants must re-authorize.

## Privacy & App Store

- Host a public **privacy policy** URL in the Partner Dashboard describing: WhatsSMS credentials, order/customer data used for messaging, retention, and GDPR contact.
- Do **not** expose WhatsSMS secrets or Shopify access tokens to the browser (this template keeps them server-side).

## Production notes

- **Deploy, Docker, nginx, GitHub Actions, and env vars:** see [`DEPLOYMENT.md`](DEPLOYMENT.md).
- **Moving an old local SQLite dev DB to Postgres:** see [`MIGRATION_SQLITE_TO_POSTGRES.md`](MIGRATION_SQLITE_TO_POSTGRES.md).
- Migrations run in **CI** and on container start (`npm run setup` → `prisma migrate deploy`).
- **`AsyncJob`** uses Postgres; optional **worker** container for dedicated polling (documented in `DEPLOYMENT.md`).
- **Health checks** (`/health`, `/ready`) and **in-memory rate limits** on public `/cod/*` (for multiple app replicas, use nginx/Cloudflare rate limiting or a shared store such as Redis).
