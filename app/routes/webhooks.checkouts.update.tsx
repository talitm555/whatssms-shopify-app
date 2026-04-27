import type { ActionFunctionArgs } from "@remix-run/node";
import { createHash } from "crypto";
import { authenticate } from "../shopify.server";
import { consumeWebhookOnce } from "../lib/webhook-idempotency.server";
import {
  isAbandonedCheckoutPayload,
  runNotificationForEvent,
} from "../lib/orders-handlers.server";

function checkoutToken(payload: Record<string, unknown>): string {
  const raw = payload.token ?? payload.checkout_token ?? payload.cart_token;
  return raw == null ? "" : String(raw).trim();
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const result = await authenticate.webhook(request);
  const shop = result.shop;
  const topic = result.topic;
  const payload = result.payload as Record<string, unknown>;
  const webhookId =
    result.webhookId ||
    createHash("sha256").update(JSON.stringify(payload)).digest("hex");

  const first = await consumeWebhookOnce(shop, topic, String(webhookId));
  if (!first) return new Response();

  if (!isAbandonedCheckoutPayload(payload)) {
    return new Response();
  }

  const token = checkoutToken(payload);
  if (!token) {
    return new Response();
  }

  // Strict dedupe: exactly one recovery notification per shop + checkout token.
  // Uses existing webhook receipt uniqueness so this survives retries and future updates.
  const dedupeId = `abandoned-checkout:${shop}:${token}`;
  const firstForCheckout = await consumeWebhookOnce(shop, topic, dedupeId);
  if (!firstForCheckout) {
    return new Response();
  }

  await runNotificationForEvent(shop, result.admin, topic, payload);
  return new Response();
};
