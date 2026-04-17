# WhatsSMS.io — Shopify public app

Embedded Shopify admin app (Remix + Polaris + App Bridge) that connects a merchant’s [WhatsSMS](https://whatssms.io) account for SMS (Android / gateway) and WhatsApp messaging via the **WhatsSMS REST API** documented in the merchant dashboard (`/dashboard/docs`).

## Features

- **OAuth + offline sessions** via `@shopify/shopify-app-remix` (App Store distribution).
- **WhatsSMS API key** stored **encrypted at rest** (AES-256-GCM; key from `APP_ENCRYPTION_SECRET`, or `SHOPIFY_API_SECRET` if unset).
- **Settings**: validate API key, view credits/devices/WhatsApp accounts (from WhatsSMS endpoints), COD templates, gateway hints.
- **Automations** (toggle + template + SMS/WhatsApp): `order_created`, `order_updated`, `customer_created`, `checkout_abandoned`, `marketing_broadcast` (consent-aware when Shopify includes SMS marketing fields).
- **COD confirmation**: on qualifying orders, sends SMS and/or WhatsApp with a **public, time-limited** link on this app (`/cod/:token?c=sms|whatsapp`). Submitting applies Shopify order tags exactly: `confirmed_via_sms`, `confirmed_via_whatsapp`, `rejected_via_sms`, `rejected_via_whatsapp` (idempotent; safe on webhook retries).
- **Webhooks**: HMAC verification via `authenticate.webhook`, idempotency via `X-Shopify-Webhook-Id` (stored in `WebhookReceipt`).
- **Queue**: `AsyncJob` table + `setImmediate` worker for follow-up work; replace with SQS/pg-boss/Cloud Tasks in production.
- **GDPR / compliance**: `customers/data_request`, `customers/redact`, `shop/redact` handlers.

## WhatsSMS API (verified paths)

Base URL defaults to `https://app.whatssms.io` (override with `WHATSSMS_API_BASE_URL`). Paths use the dashboard contract, e.g.:

- `GET /api/get/credits?secret=…`
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

### Local dev URL vs tunnel (Mac)

The Remix/Vite server uses **`PORT`** from the environment (`vite.config.ts`; often `3000` when you run Vite alone). When you use **`shopify app dev`**, the CLI also starts a **proxy** and may choose a **random localhost port**—check the terminal line **`Proxy server started on port …`**. If your Cloudflare (or other) tunnel targets **`http://127.0.0.1:3000`** but the proxy is on another port, **nothing will answer on 3000**.

**Stable port for an external tunnel (recommended):** pin the CLI to port 3000 and pass your already-running tunnel URL:

```bash
shopify app dev --config shopify.app.dev.toml --localhost-port 3000 --tunnel-url https://YOUR_TUNNEL_HOST
```

Start the tunnel first so it forwards to **`127.0.0.1:3000`**, then run the command above. Alternatively, point the tunnel at the **proxy port** printed in the terminal (no need for 3000).

Shopify’s **embedded admin** and OAuth require a **public HTTPS URL**, not raw localhost. When you run:

```bash
shopify app dev
```

the CLI may start its own tunnel or use yours; the **app home** line shows which URL the dev session uses. Use that for `SHOPIFY_APP_URL` during the session.

**Git / `shopify.app.toml`:** Keep **`application_url = "https://shopify.whatssms.io"`** (production) in the committed `shopify.app.toml`. Do **not** commit short-lived free ngrok URLs that change every run—they will confuse teammates and CI.

Recommended pattern:

1. Copy **`shopify.app.dev.toml.example`** → **`shopify.app.dev.toml`** (gitignored).
2. Set **`application_url`** to your **stable dev HTTPS host** (Cloudflare Tunnel, reserved ngrok domain, etc.). Under **`[auth].redirect_urls`**, list exactly these two URLs (same host as `application_url`): **`…/auth/callback`** and **`…/auth/session-token`**—they match `@shopify/shopify-app-remix` with `authPathPrefix: "/auth"`.
3. Run dev with that config. If you use your **own** tunnel, pin localhost and pass the tunnel URL:

   ```bash
   shopify app dev --config shopify.app.dev.toml --localhost-port 3000 --tunnel-url https://YOUR_DEV_HOST
   ```

   If the CLI manages the tunnel for you, `shopify app dev --config shopify.app.dev.toml` is enough—just aim your external tunnel at the **proxy port** from the terminal if you are not using `--localhost-port 3000`.

4. Deploy production config when releasing: `shopify app deploy` using the default `shopify.app.toml`.

### Requirements

- Node `>=20.19` (per `package.json` engines).
- Shopify Partner app + CLI (`shopify app dev`).

### Environment

Copy `.env.example` to `.env` and fill:

| Variable | Purpose |
|----------|---------|
| `PORT` | Local dev server port (default `3000`). Used by Vite and by `npm run dev` → `shopify app dev --localhost-port`. |
| `VITE_HMR_TUNNEL` | Set to `1` only if you open the app in the browser via your **tunnel hostname** (not `https://localhost:PORT`). If unset, Vite HMR targets `https://localhost:<PORT>` so `shopify app dev`’s HTTPS proxy works (avoids a blank page). |
| `DATABASE_URL` | SQLite dev: `file:./dev.sqlite` (use Postgres in production). |
| `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` | From Partner Dashboard. |
| `SCOPES` | Must match `shopify.app.toml` (orders, customers, checkouts). |
| `SHOPIFY_APP_URL` | Public HTTPS URL of the app (tunnel in dev). |
| `APP_ENCRYPTION_SECRET` | Strong secret for encrypting WhatsSMS API keys (recommended). |
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

1. In [Partner Dashboard](https://partners.shopify.com) → **Apps** → **WhatsSMS.io** (your app).
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

`read_orders,write_orders,read_customers,read_checkouts`

- **write_orders** — order tags for COD confirmation.
- **read_checkouts** — `checkouts/update` for abandoned-checkout automation.

After changing scopes, merchants must re-authorize.

## Privacy & App Store

- Host a public **privacy policy** URL in the Partner Dashboard describing: WhatsSMS credentials, order/customer data used for messaging, retention, and GDPR contact.
- Do **not** expose WhatsSMS secrets or Shopify access tokens to the browser (this template keeps them server-side).

## Production notes

- Replace SQLite with **Postgres** and run migrations in CI.
- Use a **real job queue** + worker for `AsyncJob` at scale.
- Configure **monitoring** and **rate limits** on public `/cod/*` routes if needed.
