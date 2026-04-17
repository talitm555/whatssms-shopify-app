import type { ActionFunctionArgs } from "@remix-run/node";
import { createHash } from "crypto";
import { authenticate } from "../shopify.server";
import { consumeWebhookOnce } from "../lib/webhook-idempotency.server";
import prisma from "../db.server";
import { enqueueJob } from "../lib/jobs.server";
import { buildCustomerTemplateVars } from "../lib/customer-handlers.server";

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

  const settings = await prisma.shopSettings.findUnique({ where: { shop } });
  if (!settings?.encryptedWhatssmsSecret) return new Response();

  const rule = await prisma.automation.findUnique({
    where: { shop_key: { shop, key: "customer_created" } },
  });
  if (!rule?.enabled) return new Response();

  const phone = (payload.phone as string) || null;
  if (!phone) return new Response();

  const vars = buildCustomerTemplateVars(payload);
  await enqueueJob(shop, "automation_message", {
    key: "customer_created",
    phone,
    template: rule.template,
    sendSms: rule.sendSms,
    sendWa: rule.sendWa,
    smsMode: rule.smsMode,
    smsDevice: rule.smsDevice,
    waAccount: rule.waAccount,
    templateVars: vars,
  });

  await prisma.storedCustomerRef.upsert({
    where: {
      shop_customerGid: {
        shop,
        customerGid: `gid://shopify/Customer/${payload.id}`,
      },
    },
    create: {
      shop,
      customerGid: `gid://shopify/Customer/${payload.id}`,
    },
    update: {},
  });

  return new Response();
};
