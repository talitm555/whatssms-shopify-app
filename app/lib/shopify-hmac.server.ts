import { createHmac, timingSafeEqual } from "crypto";

/**
 * @test-only
 *
 * Verifies `X-Shopify-Hmac-Sha256` for a raw webhook body (Shopify docs).
 * Exported for unit tests; never use this in production routes. Route handlers
 * must prefer `authenticate.webhook`.
 */
export function verifyShopifyWebhookHmac(
  rawBody: string,
  hmacHeader: string | null,
  apiSecret: string,
): boolean {
  if (!hmacHeader) return false;
  const digest = createHmac("sha256", apiSecret).update(rawBody, "utf8").digest("base64");
  const a = Buffer.from(digest, "utf8");
  const b = Buffer.from(hmacHeader, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
