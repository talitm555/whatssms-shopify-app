/**
 * Remix 2.17+ validates POST `Origin` against `x-forwarded-host` or `host`.
 * Tunnels and reverse proxies often leave `Host` as localhost/internal while the
 * browser sends `Origin: https://<public-app-host>` — Remix aborts with HTTP 500.
 *
 * When `Origin`'s hostname matches **`SHOPIFY_APP_URL`** or any optional
 * **`SHOPIFY_APP_EXTRA_ORIGINS`** entry, set `x-forwarded-host` from `Origin` so the
 * CSRF check matches what the user loaded.
 *
 * `SHOPIFY_APP_EXTRA_ORIGINS`: comma-separated full URLs or bare hostnames, e.g.
 * `https://ecom.whatssms.io,shopify.talitmahmood.com`
 *
 * @param {import("node:http").IncomingMessage} req
 * @param {string | undefined} shopifyAppUrl
 * @param {string | undefined} extraOriginsRaw
 */
export function alignForwardedHostForRemixCsrf(
  req,
  shopifyAppUrl,
  extraOriginsRaw,
) {
  const trusted = trustedAppHostnames(shopifyAppUrl, extraOriginsRaw);
  if (trusted.size === 0 || req.method !== "POST") return;

  const originRaw = req.headers.origin;
  const origin = Array.isArray(originRaw) ? originRaw[0] : originRaw;
  if (typeof origin !== "string") return;

  let originHost;
  try {
    if (origin === "null") {
      originHost = trustedRequestHost(req, trusted);
      if (!originHost) return;
      req.headers.origin = `https://${originHost}`;
    } else {
      const o = new URL(origin);
      if (!trusted.has(normalizeHostname(o.hostname))) return;
      originHost = o.host;
    }
  } catch {
    return;
  }

  // Remix compares `Origin` to `x-forwarded-host` first, then `host` (see
  // `parseHostHeader` in @remix-run/server-runtime). Set both so tunnels/proxies
  // cannot leave `Host: 127.0.0.1:*` while the browser sends a public `Origin`.
  req.headers["x-forwarded-host"] = originHost;
  req.headers.host = originHost;
}

/** @param {string} h */
function normalizeHostname(h) {
  return h.trim().toLowerCase();
}

function trimEnvString(s) {
  if (s == null) return "";
  return String(s).trim().replace(/^["']|["']$/g, "");
}

function trustedRequestHost(req, trusted) {
  const forwardedHostRaw = req.headers["x-forwarded-host"];
  const hostRaw = forwardedHostRaw || req.headers.host;
  const host = Array.isArray(hostRaw) ? hostRaw[0] : hostRaw;
  if (typeof host !== "string") return null;

  const firstHost = host.split(",")[0]?.trim();
  if (!firstHost) return null;

  try {
    const parsed = new URL(`https://${firstHost}`);
    return trusted.has(normalizeHostname(parsed.hostname)) ? parsed.host : null;
  } catch {
    return null;
  }
}

function trustedAppHostnames(shopifyAppUrl, extraOriginsRaw) {
  const set = new Set();
  const primary = trimEnvString(shopifyAppUrl);
  if (primary) {
    try {
      set.add(normalizeHostname(new URL(primary).hostname));
    } catch {
      /* ignore */
    }
  }
  const extra = trimEnvString(extraOriginsRaw);
  if (!extra) return set;
  for (const part of extra.split(",")) {
    const s = part.trim();
    if (!s) continue;
    try {
      if (s.includes("://")) {
        set.add(normalizeHostname(new URL(s).hostname));
      } else {
        const hostOnly = s.replace(/^\/\//, "").split("/")[0] ?? "";
        set.add(normalizeHostname(hostOnly.split(":")[0] ?? ""));
      }
    } catch {
      /* ignore */
    }
  }
  return set;
}
