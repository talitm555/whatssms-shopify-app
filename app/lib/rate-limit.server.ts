/**
 * In-memory fixed-window rate limits for public COD routes (single replica).
 * Tuned via env: COD_RATE_LIMIT_READ_PER_MIN (default 120), COD_RATE_LIMIT_WRITE_PER_MIN (default 40).
 */
const buckets = new Map<string, number>();

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  const fromFwd = fwd?.split(",")[0]?.trim();
  if (fromFwd) return fromFwd;
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return "unknown";
}

function windowBucket(ip: string, kind: string): string {
  const w = Math.floor(Date.now() / 60_000);
  return `${kind}|${w}|${ip}`;
}

function limitFor(kind: "read" | "write"): number {
  if (kind === "write") {
    const n = Number(process.env.COD_RATE_LIMIT_WRITE_PER_MIN);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 40;
  }
  const n = Number(process.env.COD_RATE_LIMIT_READ_PER_MIN);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 120;
}

/** Returns a 429 Response when over limit; otherwise null. */
export function codRateLimitResponse(request: Request, kind: "read" | "write"): Response | null {
  const max = limitFor(kind);
  const key = windowBucket(clientIp(request), kind);
  const next = (buckets.get(key) ?? 0) + 1;
  buckets.set(key, next);
  if (buckets.size > 50_000) {
    const cutoff = Math.floor(Date.now() / 60_000) - 2;
    for (const k of buckets.keys()) {
      const parts = k.split("|");
      const w = parts.length >= 2 ? Number(parts[1]) : NaN;
      if (Number.isFinite(w) && w < cutoff) buckets.delete(k);
    }
  }
  if (next > max) {
    return new Response("Too Many Requests", {
      status: 429,
      headers: { "Retry-After": "60", "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return null;
}
