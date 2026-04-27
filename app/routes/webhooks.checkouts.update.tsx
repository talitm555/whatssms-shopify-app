import type { ActionFunctionArgs } from "@remix-run/node";
import { createHash } from "crypto";
import { authenticate } from "../shopify.server";
import { consumeWebhookOnce } from "../lib/webhook-idempotency.server";
import { cancelDeferredAbandonedCheckoutJobs } from "../lib/jobs.server";
import {
  checkoutPayloadToken,
  isAbandonedCheckoutPayload,
  runNotificationForEvent,
} from "../lib/orders-handlers.server";

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

  const checkoutToken = checkoutPayloadToken(payload);
  if (checkoutToken && payload.completed_at) {
    await cancelDeferredAbandonedCheckoutJobs(shop, checkoutToken);
  }

  if (!isAbandonedCheckoutPayload(payload)) {
    return new Response();
  }

  await runNotificationForEvent(shop, result.admin, topic, payload);
  return new Response();
};
