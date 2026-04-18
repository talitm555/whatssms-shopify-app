#!/usr/bin/env node
/**
 * Loads `.env` so `PORT` applies to `shopify app dev --localhost-port`.
 * Default port 3150 — point Cloudflare Tunnel at `http://127.0.0.1:3150`.
 * Usage: npm run dev [-- extra shopify args]
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env");

if (existsSync(envPath)) {
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

const port = process.env.PORT || "3150";
const extra = process.argv.slice(2);

const child = spawn(
  "npx",
  ["shopify", "app", "dev", "--localhost-port", port, ...extra],
  { stdio: "inherit", shell: true, cwd: root, env: process.env },
);

child.on("exit", (code) => process.exit(code ?? 0));
