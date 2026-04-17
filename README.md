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

### Requirements

- Node `>=20.19` (per `package.json` engines).
- Shopify Partner app + CLI (`shopify app dev`).

### Environment

Copy `.env.example` to `.env` and fill:

| Variable | Purpose |
|----------|---------|
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

### Tests

```bash
npm test
```

Covers Shopify webhook HMAC verification helpers and COD detection / tag naming.

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
