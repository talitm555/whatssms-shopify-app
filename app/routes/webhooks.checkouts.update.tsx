import type { ActionFunctionArgs } from "@remix-run/node";
import { createHash } from "crypto";
import { authenticate } from "../shopify.server";
import { consumeWebhookOnce } from "../lib/webhook-idempotency.server";
import prisma from "../db.server";
import { enqueueJob } from "../lib/jobs.server";
/**
 * Abandoned checkout: `completed_at` is null and checkout has contact info.
 * Shopify sends checkouts/update frequently; combine with idempotency + light heuristics.
 */
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

  if (payload.completed_at) {
    return new Response();
  }

  const settings = await prisma.shopSettings.findUnique({ where: { shop } });
  if (!settings?.encryptedWhatssmsSecret) return new Response();

  const rule = await prisma.automation.findUnique({
    where: { shop_key: { shop, key: "checkout_abandoned" } },
  });
  if (!rule?.enabled) return new Response();

  const phone =
    (payload.phone as string) ||
    ((payload.shipping_address as Record<string, unknown> | undefined)?.phone as string) ||
    null;
  if (!phone) return new Response();

  const vars = {
    checkout_token: String(payload.token || ""),
    abandoned_checkout_url: String(payload.abandoned_checkout_url || ""),
  };

  await enqueueJob(shop, "automation_message", {
    key: "checkout_abandoned",
    phone,
    template: rule.template,
    sendSms: rule.sendSms,
    sendWa: rule.sendWa,
    smsMode: rule.smsMode,
    smsDevice: rule.smsDevice,
    waAccount: rule.waAccount,
    templateVars: vars,
  });

  return new Response();
};
