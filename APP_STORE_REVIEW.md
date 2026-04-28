# WhatsSMS.io Shopify app — App Store pre-submission handoff

**Audience:** Your AI coding agent (or human).  
**Do not** treat this as legal advice. Have counsel review policy changes before publication.

**Related docs (Shopify):** [App Store requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements) · [Best practices](https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices) · [Submit for review](https://shopify.dev/docs/apps/launch/app-store-review/submit-app-for-review) · [Billing](https://shopify.dev/docs/apps/launch/billing) · [Changelog: more automated pre-submission checks (Apr 2025)](https://shopify.dev/changelog/more-automated-checks-for-app-review-pre-submission-page) · [Changelog: new app submission experience (Apr 20, 2026)](https://shopify.dev/changelog/new-app-submission-experience-in-the-partner-dashboard)

---

## 1. Executive summary

| bucket | count |
|--------|-------:|
| Likely passing (rubric) | 24 |
| Needs review | 3 |
| Likely failing / must fix pre-submit | 3 |

**Blockers to fix before submission**

1. **B1** — `ApiVersion` in code does not match `api_version` in TOML (`2026-04` vs `January25`).
2. **B2** — Public landing pages expose a **shop domain** text field (`/`, `/auth/login`) — conflicts with *Initiate installation from a Shopify-owned surface* automated check.
3. **B3** — Connection page shows **“Package: …”** from WhatsSMS subscription; product owner wants **100% free Shopify app** framing. Remove “package” semantics; keep optional neutral usage rows only (no paywall, no “upgrade” language).

**Nice-to-have (Built for Shopify / review polish)**

- H1–H7: encryption secret, COD headers, favicon check, multi-replica rate limit note, env validation, Polaris minor bump.

**Implementation status (codebase)**

- B1–B3 implemented in the Shopify app code: API version now uses `2026-04`, public shop-domain login forms were removed, and the embedded connection page uses neutral account-usage wording.
- H1–H5 implemented or documented: production encryption secret enforcement, test-only HMAC helper note, COD security headers, multi-replica rate-limit guidance, and runtime env validation.
- Privacy policy and terms updates were implemented in `frontend-website`; listing icon/feature assets and listing copy were prepared under `listing-assets/`.
- TLS verification passed for `whatssms.io` and `shopify.whatssms.io`; local policy-page visual checks passed.
- Still manual/external before submission: deploy the website updates, run Partner Dashboard automated checks and AI self-review from an authenticated Shopify Partner session, capture final embedded-app screenshots, and complete reinstall/OAuth checks in the dashboard/dev store.

---

## 2. Full rubric (shopify-app-store-review skill) — this codebase

> Status: **Pass** = evidence in repo / obvious N/A. **Review** = verify manually (Dashboard, runbooks). **Fail** = must change before listing.

| # | Requirement | Status | Evidence / notes |
|---|-------------|--------|------------------|
| 1 | Session tokens (embedded, no 3P cookie auth) | Pass | `authenticate.admin` + `@shopify/shopify-app-remix` + `unstable_newEmbeddedAuthStrategy` in [app/shopify.server.ts](app/shopify.server.ts); `AppProvider isEmbeddedApp` in [app/routes/app.tsx](app/routes/app.tsx) |
| 2 | Use Shopify checkout (no offsite order bypass) | Pass | No payment/checkout bypass; [app/routes/cod.$token.tsx](app/routes/cod.$token.tsx) tags/cancels via Admin API on existing orders only |
| 3 | Theme Store for themes | Pass | No Themes API / theme install |
| 4 | Factual data only | Pass | No fake reviews/stats; templates use real webhooks + GraphQL |
| 5 | No classifieds marketplace in one store | Pass | Single-merchant automations per shop |
| 6 | Payment apps only via Payments API | Pass | N/A (not a payments app) |
| 7 | No third-party POS sync | Pass | N/A |
| 8 | Buyer consent for added charges | Pass | N/A (no cart/checkout line-item fees) |
| 9 | Cheapest shipping default | Pass | N/A (no shipping option reorder) |
| 10 | No unauthorized product copy | Pass | N/A |
| 11 | No dev/agency marketplace | Pass | N/A |
| 12 | Refunds only via original processor | Pass | N/A (no custom refund to wallet) |
| 13 | No capital/lending | Pass | N/A |
| 14 | **Managed Pricing or Billing API** | Pass* | *Per product decision: **the Shopify app charges $0**; off-platform WhatsSMS product billing is separate. Listing must not imply Shopify subscription unlocks the integration. No `appSubscriptionCreate` in repo — **correct for a free app**. |
| 15 | Implement billing API correctly if you charge | N/A | No in-app charge |
| 16 | Plan changes without support | N/A | No in-app plan |
| 17 | Use Shopify APIs | Pass | Webhooks, Admin API via sessions |
| 18 | Auth immediately after install | Review | **Verify** in Partner pre-check + fresh install: OAuth first, no usable `/app` UI before auth |
| 19 | No promos/ads in admin **extensions** | Pass | [extensions/](extensions/) is empty; in-app is standard embedded routes, not TOML admin actions/blocks. **Do not** add affiliate banners inside `/app/*` later. |
| 20 | Max modal / fullscreen only on interaction | Pass | No ResourcePicker full-screen abuse found |
| 21 | **No manual shop install field** | **Fail** | [app/routes/_index/route.tsx](app/routes/_index/route.tsx) and [app/routes/auth.login/route.tsx](app/routes/auth.login/route.tsx) — `TextField name="shop"`. **Fix: B2.** |
| 22 | (dup) Auth after install | see 18 | |
| 23 | Redirect to app UI after OAuth | Pass | Standard Remix/Shopify template; [app/routes/_index](app/routes/_index/route.tsx) redirects embedded → `/app` |
| 24 | OAuth on reinstall | Review | **Verify** uninstall → reinstall; session rows handled by [webhooks.app.uninstalled](app/routes/webhooks.app.uninstalled.tsx) + Prisma |
| 25 | Valid TLS | Review | Production must use valid HTTPS; verify `https://shopify.whatssms.io` in browser + SSL Labs (human) |
| 26 | `read_all_orders` only if needed | Pass | Not requested in [shopify.app.toml](shopify.app.toml) |
| 27 | `write_payment_mandate` | Pass | Not in scopes |
| 28 | `write_checkout_extensions_apis` | Pass | Not in scopes / no TAE |
| 29 | `read_advanced_dom_pixel_events` | Pass | Not in scopes |
| 30 | `read_checkout_extensions_chat` | Pass | Not in scopes |

---

## 3. Blocker fixes (exact instructions)

### B1 — Unify API version to `2026-04` (`ApiVersion.April26`)

**Why:** [shopify.app.toml](shopify.app.toml) has `api_version = "2026-04"` (webhook registration) but [app/shopify.server.ts](app/shopify.server.ts) uses `ApiVersion.January25`. Automated checks and runtime behavior can diverge; Admin GraphQL client must match a supported `ApiVersion` enum in `@shopify/shopify-api`.

**In `@shopify/shopify-api` (your installed v13+), the enum is:**

| Enum member | String |
|-------------|--------|
| `ApiVersion.April26` | `"2026-04"` |

**Change:**

- File: [app/shopify.server.ts](app/shopify.server.ts)
- Replace:
  - `apiVersion: ApiVersion.January25` → `apiVersion: ApiVersion.April26` (2 occurrences: `shopifyApp` and export `apiVersion`).

**If TypeScript error:** bump `@shopify/shopify-api` and `@shopify/shopify-app-remix` in [package.json](package.json) to the latest minor that **exports** `ApiVersion.April26` (already present in `node_modules` at `^13.x` in many installs).

**Regression tests (must run after bump):**

1. `npm run build`
2. `npm test` (Vitest)
3. On a **dev store**: install app → open embedded `/app/connection` → save API key
4. Trigger: `orders/create` webhook (test order) → COD link created if applicable
5. `cod/<token>` page: confirm + reject (GraphQL `orderUpdate`, `tagsAdd`, `orderCancel` paths in [app/lib/order-admin.server.ts](app/lib/order-admin.server.ts))

**Acceptance:** `shopify.app.toml` `api_version` and `apiVersion` in `shopify.server.ts` both correspond to `2026-04`.

---

### B2 — Remove shop-domain form from public surfaces

**Why:** App Store *Initiate installation from a Shopify-owned surface* / automated pre-checks look for `*.myshopify.com` manual install patterns.

**Files:**

- [app/routes/_index/route.tsx](app/routes/_index/route.tsx)
- [app/routes/auth.login/route.tsx](app/routes/auth.login/route.tsx)

**Target behavior:**

1. **`/` (index)**  
   - **Keep** the `loader` redirect when `embedded=1` or `?shop=` is present (lines 30–32) — that preserves embedded app deep links.  
   - For non-embedded visitors, **remove** the `<Form>`, `TextField name="shop"`, and the copy “sign in with your shop domain below.”  
   - Replace with a **static** card:
     - One-line: WhatsSMS.io connects Shopify to SMS/WhatsApp via the WhatsSMS platform.
     - **Primary CTA button:** `Install on Shopify` → set `url` to your **public App Store listing URL** when live (e.g. `https://apps.shopify.com/...` — placeholder `YOUR_APPS_SHOPIFY_COM_URL` until published).
     - Secondary: link to [https://whatssms.io](https://whatssms.io) for product marketing (optional).
   - You may set `return { showForm: false }` and delete `showForm` from the component entirely.

2. **`/auth/login`**  
   - Remove the shop `TextField` and POST form.  
   - The **`login(request)`** from `@shopify/shopify-app-remix/server` should still run in `loader`/`action` to return redirects for valid OAuth handshakes.  
   - If `login` returns a **redirect URL** to Shopify OAuth when the request is already a valid start from Admin, you can `throw redirect` from the loader.  
   - If unauthenticated user hits bare `/auth/login` with no `shop` query: show **the same** static “Install from App Store” message as `/` — not a shop input.

**Dev-only escape hatch (optional, recommended for local `shopify app dev`):**  
- Gate a minimal shop input behind `process.env.SHOPIFY_DEV_ALLOW_SHOP_INPUT === "true"` **and** `NODE_ENV !== "production"`. **Never** ship that in prod Docker.

**Acceptance:** Grep the repo: no `name="shop"` in UI routes in production build; or only behind dev-only flag.

```bash
rg 'name="shop"' shopify-app/app/routes
```

---

### B3 — Neutralize “package / subscription” wording in embedded admin

**File:** [app/routes/app.connection.tsx](app/routes/app.connection.tsx)

**Current (problematic for “free app” + promo optics):** heading “Subscription & Quota Details” and line “Package: **{subscription.packageName}**”.

**Change:**

- Rename section title to e.g. **“WhatsSMS account usage”** (not “Subscription & Quota” if you want zero subscription vocabulary in-Shopify; product owner can pick “Account limits” instead).
- **Delete** the `<Text>Package: <strong>…` block entirely. Remove `packageName` from loader return if unused, or keep in loader for debugging only — do not render.
- Keep the **per-key usage** rows and progress bars — they are informational, not a paywall, as long as there is **no** “Upgrade” link to whatssms.io pricing from this page.
- Tweak subtitle under “Account Credits” to avoid “Subscription quotas” if you are scrubbing the word: e.g. “**Plan limits and feature quotas** in your WhatsSMS account (managed at whatssms.io) are shown below” — or drop the sentence and keep the technical rows only.

**Acceptance:** No `Package:`, `subscription` (in UI copy), or pricing upsell links from `/app/*` → whatssms.io /pricing. API keys link to `dashboard/tools/keys` is OK.

---

## 4. Hardening (H1–H7)

| ID | Item | What to do |
|----|------|------------|
| H1 | `APP_ENCRYPTION_SECRET` | In [app/lib/crypto.server.ts](app/lib/crypto.server.ts), if `NODE_ENV === "production"` and `!process.env.APP_ENCRYPTION_SECRET`, `throw` at module init (or in `getKey()`) with a clear error. **Do not** use `SHOPIFY_API_SECRET` as a silent fallback in production. |
| H2 | HMAC util | [app/lib/shopify-hmac.server.ts](app/lib/shopify-hmac.server.ts) is **only** used in tests. Either add `// @test-only` docblock + move under `__tests__`, or keep and document “never use in production routes — `authenticate.webhook` only.” |
| H3 | Public COD page headers | In [app/routes/cod.$token.tsx](app/routes/cod.$token.tsx), add `export function headers() { return { "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Permissions-Policy": "camera=(), microphone=()", ...tightCsp }; }` and define a **nonce-free** CSP allowing only inline styles you emit (or move styles to a small linked CSS). HSTS: configure at **reverse proxy** (nginx, Cloudflare), not in Remix, unless you force HTTPS in app. |
| H4 | Rate limit | [app/lib/rate-limit.server.ts](app/lib/rate-limit.server.ts) in-memory `Map` — add README note: multi-replica = use Redis. Not a listing blocker. |
| H5 | Boot env | Add `ensureEnv.ts` and call from [app/shopify.server.ts](app/shopify.server.ts) or server entry: require `DATABASE_URL`, `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, and in production `APP_ENCRYPTION_SECRET`. |
| H6 | Favicon | [app/root.tsx](app/root.tsx) uses `/favicon.png`. **Confirmed:** [public/favicon.png](public/favicon.png) exists. If 404 in prod, check Docker `COPY` includes `public/`. |
| H7 | Polaris | Optional bump `@shopify/polaris` to latest 12.x/13.x per your React 18 support matrix; run visual smoke test. |

---

## 5. Privacy policy — paste blocks for `https://whatssms.io/privacy`

Add a new top-level **section (e.g. after §2 or before §3)**. Replace bracketed text.

```markdown
## [X]. Processing of Shopify merchant data (Shopify app integration)

When a merchant installs the **WhatsSMS.io** application from the Shopify App Store, Lagash Ltd (WhatsSMS.io) processes personal data in its capacity as a **processor** (or sub-processor, as applicable) on behalf of the **merchant (controller)** who operates the Shopify store, in order to provide the app’s functionality. This is in addition to the data described in “Data We Collect” in this Policy for the standalone WhatsSMS.io product.

**Categories of data from Shopify (examples):** shop domain, OAuth access data needed to act on the merchant’s behalf, order and checkout identifiers, order financial and fulfillment fields, line items, and customer / shipping / billing contact fields (including name, email, and phone) when included in the payloads the merchant’s store sends to the app. We use this data to provide configuration, message templating, automation, log delivery, and in-product features you enable (such as order-related notifications and merchant-configured automations), including compliance webhooks as required by Shopify for public apps.

**Sub-processors:** the hosting provider(s) and infrastructure you use to run `https://shopify.whatssms.io/`, the database used for the app, and the WhatsSMS API (`https://app.whatssms.io` or the URL you configure) as necessary to deliver message sending features. [List actual vendor names, e.g. Hetzner, AWS, etc.]

**Access tokens and secrets:** access tokens and API secrets used to integrate with your platform are stored on servers only and are not exposed to the merchant’s web browser, except that merchants type their WhatsSMS API key into the embedded app UI which is then encrypted at rest (AES-256-GCM) on your app servers.  

**No sale of personal information:** we do not sell Shopify order or customer personal data.  

**International transfers:** data may be processed in the [United Kingdom] and [other countries where your providers operate]. We use [appropriate safeguards such as the UK addendum to the EU standard contractual clauses / the EU SCCs] as applicable.

**Data subject requests regarding Shopify data:** the merchant (Shopify store owner) should be directed to exercise GDPR/CCPA etc. rights with the merchant in the first instance. You may also contact us at [privacy/whatssms@…] to assist the merchant in fulfilling obligations related to the app.  

**More detail — Shopify’s mandatory app compliance (webhook topics):** we process **customers/data_request** (to respond with relevant stored data in our standard format for the app’s database model), **customers/redact** (we delete or anonymize app-side references when required), and **shop/redact** (we delete shop-scoped app data within the timeframe required by Shopify). [Align exact deletion SLAs in your ops runbook: shop redact ≤ 48h from receipt is a common Shopify app requirement — confirm current Partner docs.]
```

After adding, re-read the rest of the policy to remove **contradictions** (e.g. if you state “all data in UK” but you use US hosting — fix).

---

## 6. Terms & conditions — paste block for `https://whatssms.io/terms`

Add a new **section (e.g. 2a or new §13)**.

```markdown
## [N]. Use with the Shopify app

1. The **WhatsSMS.io Shopify application** (the “Shopify app”) is offered **at no charge to install and use the integration** as made available in the Shopify App Store. [If this is 100% accurate — keep. If you ever add a separate Shopify app monthly fee later, you must use Shopify’s billing APIs for that.]

2. A **separate** WhatsSMS.io product account, API key, and (where available) your subscription or credits to the WhatsSMS.io service may be **required to send messages** through the WhatsSMS platform. **Fees for WhatsSMS.io (if any) are not Shopify fees** and are governed by the pricing and billing terms of WhatsSMS.io, not the Shopify platform.

3. You (the merchant) are solely responsible for **messaging and marketing compliance**, including [TCPA / PECR / ePrivacy / GDPR] as applicable, **opt-in / consent** for marketing messages, and anti-spam laws. The Shopify app and WhatsSMS.io do not by themselves make your messages legal for your use case. You will not use the app to send unsolicited or unlawful messages.

4. The Shopify app reads and writes Shopify data only as needed to perform the app’s features (see our Privacy Policy). The merchant is the data controller; WhatsSMS.io processes such data in accordance with our Privacy Policy, this Agreement, and Shopify’s requirements for app developers.  

5. [Shopify, Shopify’s trademarks, and the Shopify App Store are the property of Shopify Inc. or its affiliates. This app is an independent product and is not sponsored or endorsed by Shopify.]

6. [Optional — link to] Shopify [Acceptable Use Policy](https://www.shopify.com/legal/aup) and [Acceptable use policy for apps in the App Store] — merchants must not use the app in a way that violates them.
```

**Support block for Partner Dashboard (company details):** ensure terms list **Legal name (Lagash Ltd), company number, registered address, support email, support phone** — your listing’s support fields must **match** public legal/support pages (Shopify checks consistency).

---

## 7. Shopify 2025–2026 automated + AI self-review (runbook)

1. **Partner Dashboard** → your app → **Distribution** → start **Submit for review** (or open the submission draft).
2. **Automated pre-submission checks** (expanded Apr 2025): fix **green** on  
   - OAuth immediately on install, redirect to app UI after install,  
   - uninstall + reinstall,  
   - current **App Bridge** (your embedded shell uses `AppProvider` + `NavMenu` — good),  
   - listing name/description lint (English).
3. **New submission UX (live Apr 20, 2026, per [changelog](https://shopify.dev/changelog/new-app-submission-experience-in-the-partner-dashboard)):**  
   - Requirement-level tracking in Dashboard (each item has status, comments, Q&A).  
   - **Cannot resubmit** until every open requirement is resolved.  
4. **AI self-review (Shopify description):** run the **AI-powered self-review** from the **Shopify AI toolkit** *before* human review — \~2 minutes, catches common app-store blockers. Fix red/orange items, redeploy, re-run.  
5. Re-run automated checks after each deploy. Only then request human review.

**Flow (same as your plan):** Partner → automated checks → AI self-review → fix code → re-run → submit → per-requirement tracker in Dashboard → public listing (after passing).

---

## 8. App Store listing checklist (WhatsSMS.io)

- [ ] **App name** — “WhatsSMS.io” (match [shopify.app.toml](shopify.app.toml) `name`, avoid excessive keywords).
- [ ] **Tagline** — 1 line: SMS + WhatsApp from Shopify, powered by your WhatsSMS account. No “#1 / guaranteed” unverifiable claims.
- [ ] **Icon** — 1200×1200 PNG, no text overlay (Shopify spec).
- [ ] **Feature graphic** — 1600×900, product branding; avoid embedding fake Shopify admin screenshots that violate screenshot rules.
- [ ] **3–6 screenshots** — from **embedded** admin: Home, Connection (connected), Default Senders, COD, Notifications list, Notifications editor or Placeholders.
- [ ] **Pricing** — **Free** (or “Free to install” + clear text that WhatsSMS account/usage may have separate terms — consistent with B3 + Terms section).
- [ ] **Support email** — matches `https://whatssms.io` contact; monitors ticket SLA you promise.
- [ ] **Demo store URL** (if required) — a dev store where reviewers can install, connect a **test** WhatsSMS API key, and trigger a harmless automation (e.g. test order). Document test credentials in **private** Partner **reviewer instructions**, not in public listing.
- [ ] **Privacy policy** — `https://whatssms.io/privacy` (updated with §5 above).
- [ ] **GDPR** — [shopify.app.toml](shopify.app.toml) compliance webhooks + [webhooks.customers.*.tsx](app/routes/) + [webhooks.shop.redact.tsx](app/routes/webhooks.shop.redact.tsx) deployed and receiving events in prod logs.
- [ ] **Works in incognito** — Chrome incognito, embedded: no reliance on 3P cookies (session token path).

---

## 9. Built for Shopify (BFS) — not automatic with listing

Getting **listed** ≠ BFS. BFS has separate performance, support, and quality criteria (merchants, reviews, uptime, and Shopify’s BFS program rules). Revisit after 50+ installs and stable reviews, per [Shopify BFS / program docs](https://shopify.dev/docs/apps/launch/best-practices) and current year policy.

---

## 10. Verification script (for your agent after edits)

```bash
cd shopify-app
npm ci
npm run lint
npm test
npm run build
# Optional: run against staging URL
curl -sI https://shopify.whatssms.io/health | head -5
curl -sI https://shopify.whatssms.io/favicon.png | head -5
```

---

*End of `APP_STORE_REVIEW.md` — hand this file to the coding agent to implement B1–B3 and H* items; copy policy sections to whatssms.io; then run Partner pre-checks and AI self-review before submit.*
