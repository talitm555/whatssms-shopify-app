const LOCAL_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
]);

/**
 * In production, redirect cleartext HTTP to HTTPS so all client–server traffic
 * uses TLS (complements the hosting provider’s certificate).
 * Skips local dev and when `DISABLE_HTTPS_REDIRECT=1` (e.g. special proxy setups).
 */
export function httpsRedirectIfNeeded(request: Request): Response | null {
  if (process.env.NODE_ENV !== "production") return null;
  if (process.env.DISABLE_HTTPS_REDIRECT === "1") return null;

  const url = new URL(request.url);
  if (LOCAL_HOSTNAMES.has(url.hostname)) return null;

  const forwardedProto = request.headers.get("X-Forwarded-Proto");
  const isHttps =
    forwardedProto === "https" ||
    (forwardedProto == null && url.protocol === "https:");

  if (isHttps) return null;

  const host = request.headers.get("X-Forwarded-Host") || url.host;
  const target = new URL(request.url);
  target.protocol = "https:";
  target.host = host;
  return Response.redirect(target.toString(), 308);
}

/** HSTS: tell browsers to use HTTPS for this host on future visits. */
export function appendStrictTransportSecurity(headers: Headers): void {
  if (process.env.NODE_ENV !== "production") return;
  if (headers.has("Strict-Transport-Security")) return;
  headers.set("Strict-Transport-Security", "max-age=31536000");
}
