# Migrating a local SQLite dev database to PostgreSQL (macOS)

The app **no longer uses SQLite**. Prisma migrations are **PostgreSQL-only**. If you still have an old `prisma/dev.sqlite` (or `file:./dev.sqlite`) from before this change, Prisma will not “convert” it automatically. Use one of the approaches below.

## 1. Fresh dev (simplest)

If you do not need to keep local sessions or settings:

1. Install PostgreSQL locally (e.g. Homebrew) and ensure it listens on **`127.0.0.1:5432`**.
2. Create a database and user, e.g.:

   ```bash
   createdb shopify_whatssms
   createuser shopify_whatssms -P
   ```

3. Set in `.env`:

   ```bash
   DATABASE_URL="postgresql://shopify_whatssms:YOUR_PASSWORD@127.0.0.1:5432/shopify_whatssms?schema=public"
   ```

4. Apply schema:

   ```bash
   npx prisma migrate deploy
   ```

5. Reinstall / open the app on your **Shopify development store** and reconnect WhatsSMS (sessions and `ShopSettings` live in Postgres now).

## 2. Keep merchant-facing settings (manual)

SQLite and Postgres are different engines; Prisma does not ship a one-click data migration between them.

If you must preserve **`ShopSettings`** (encrypted secret, templates, COD options, etc.):

1. Create the empty Postgres database and run `npx prisma migrate deploy` as above.
2. From the old SQLite era, export only the tables you care about (e.g. `ShopSettings`, `Automation`) using a SQLite tool (`sqlite3` CLI, DB Browser for SQLite) as **CSV** or **SQL inserts**.
3. Adjust types / booleans / timestamps for Postgres compatibility and import into Postgres (often easiest with small tables via CSV + `COPY` or hand-written `INSERT`s).
4. Do **not** copy `Session` unless you understand Shopify’s session format and expiry; re-authenticating the dev store is usually faster.

## 3. Parallel run (advanced)

Run the old commit on SQLite in a separate clone only long enough to read data, while day-to-day work uses Postgres in this repo. Merge any exported data into Postgres as in (2).

## After migration

- Remove any old `DATABASE_URL=file:./dev.sqlite` from `.env`.
- Delete `prisma/dev.sqlite` if present (it is no longer used).
- Confirm `npm run dev` and `npx prisma migrate deploy` both use the same `DATABASE_URL`.

For **production** deployment, see [`DEPLOYMENT.md`](DEPLOYMENT.md).
