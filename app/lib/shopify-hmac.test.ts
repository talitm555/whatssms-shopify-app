import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { verifyShopifyWebhookHmac } from "./shopify-hmac.server";

describe("verifyShopifyWebhookHmac", () => {
  const secret = "test_secret";
  const body = '{"id":1}';

  it("accepts valid HMAC", () => {
    const hmac = createHmac("sha256", secret).update(body, "utf8").digest("base64");
    expect(verifyShopifyWebhookHmac(body, hmac, secret)).toBe(true);
  });

  it("rejects invalid HMAC", () => {
    expect(verifyShopifyWebhookHmac(body, "not-a-mac", secret)).toBe(false);
  });

  it("rejects missing header", () => {
    expect(verifyShopifyWebhookHmac(body, null, secret)).toBe(false);
  });
});
