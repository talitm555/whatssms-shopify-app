import type { ActionFunctionArgs } from "@remix-run/node";
import { createHash } from "crypto";
import { authenticate } from "../shopify.server";
import { consumeWebhookOnce } from "../lib/webhook-idempotency.server";
import { handleOrderCreated } from "../lib/orders-handlers.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const result = await authenticate.webhook(request);
  const shop = result.shop;
  const topic = result.topic;
  const payload = result.payload as Record<string, unknown>;
  const webhookId =
    result.webhookId ||
    createHash("sha256").update(JSON.stringify(payload)).digest("hex");

  const first = await consumeWebhookOnce(shop, topic, String(webhookId));
  if (!first) {
    return new Response();
  }

  await handleOrderCreated(shop, result.admin, payload);
  return new Response();
};
