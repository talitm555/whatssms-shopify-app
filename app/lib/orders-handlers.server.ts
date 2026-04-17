import { randomBytes } from "crypto";
import prisma from "../db.server";
import { decryptSecret } from "./crypto.server";
import { isLikelyCodOrder } from "./cod-detection.server";
import { applyTemplate, type TemplateVars } from "./template.server";
import { defaultWhatssmsBaseUrl, WhatssmsClient } from "./whatssms.server";
import { enqueueJob } from "./jobs.server";

type AdminGraphql = {
  graphql: (
    query: string,
    opts?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

function orderGid(numericId: number | string): string {
  return `gid://shopify/Order/${numericId}`;
}

function pickPhone(order: Record<string, unknown>): string | null {
  const o = order;
  const direct = o.phone as string | undefined;
  if (direct) return direct;
  const customer = o.customer as Record<string, unknown> | undefined;
  if (customer?.phone) return String(customer.phone);
  const ship = o.shipping_address as Record<string, unknown> | undefined;
  if (ship?.phone) return String(ship.phone);
  const bill = o.billing_address as Record<string, unknown> | undefined;
  if (bill?.phone) return String(bill.phone);
  return null;
}

function buildOrderVars(order: Record<string, unknown>, extra: TemplateVars = {}): TemplateVars {
  const customer = (order.customer as Record<string, unknown>) || {};
  const name =
    [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
    (customer.email as string) ||
    "";
  return {
    order_name: String(order.name || ""),
    order_total: `${order.total_price ?? ""} ${order.currency ?? ""}`.trim(),
    customer_name: name,
    shop_order_id: String(order.id ?? ""),
    ...extra,
  };
}

export async function handleOrderCreated(
  shop: string,
  admin: AdminGraphql | undefined,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!admin) {
    console.warn("orders/create: no admin session for shop", shop);
    return;
  }

  const settings = await prisma.shopSettings.findUnique({ where: { shop } });
  if (!settings?.encryptedWhatssmsSecret) return;

  const order = payload;
  const numericId = Number(order.id);
  const gid = orderGid(numericId);
  const hints =
    settings.codGatewayHints?.split(",").map((s) => s.trim()).filter(Boolean) || [];

  const cod = settings.codEnabled && isLikelyCodOrder(order as never, hints);

  if (cod) {
    await sendCodConfirmationFlow({
      shop,
      admin,
      order,
      settings,
    });
  }

  await runAutomation({
    shop,
    admin,
    key: "order_created",
    order,
    settings,
  });
}

export async function handleOrderUpdated(
  shop: string,
  admin: AdminGraphql | undefined,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!admin) return;
  const settings = await prisma.shopSettings.findUnique({ where: { shop } });
  if (!settings?.encryptedWhatssmsSecret) return;

  await runAutomation({
    shop,
    admin,
    key: "order_updated",
    order: payload,
    settings,
  });
}

async function sendCodConfirmationFlow(ctx: {
  shop: string;
  admin: AdminGraphql;
  order: Record<string, unknown>;
  settings: {
    encryptedWhatssmsSecret: string;
    whatssmsApiBaseUrl: string | null;
    codSendSms: boolean;
    codSendWhatsapp: boolean;
    codSmsTemplate: string;
    codWaTemplate: string;
    codLinkTtlHours: number;
    defaultSmsMode: string;
    defaultSmsDeviceId: string | null;
    defaultWaAccountId: string | null;
  };
}): Promise<void> {
  const { shop, order, settings } = ctx;
  const secret = decryptSecret(settings.encryptedWhatssmsSecret);
  const base = settings.whatssmsApiBaseUrl || defaultWhatssmsBaseUrl();
  const client = new WhatssmsClient(base, secret);

  const phone = pickPhone(order);
  if (!phone) {
    console.warn("COD flow: no phone on order", order.id);
    return;
  }

  const publicToken = randomBytes(24).toString("hex");
  const expiresAt = new Date(
    Date.now() + Math.max(1, settings.codLinkTtlHours) * 3600 * 1000,
  );

  const appUrl = (process.env.SHOPIFY_APP_URL || "").replace(/\/+$/, "");
  const confirmUrlSms = `${appUrl}/cod/${publicToken}?c=sms`;
  const confirmUrlWa = `${appUrl}/cod/${publicToken}?c=whatsapp`;

  const vars = buildOrderVars(order, {
    confirm_url: confirmUrlSms,
    confirm_url_sms: confirmUrlSms,
    confirm_url_wa: confirmUrlWa,
  });

  await prisma.codToken.create({
    data: {
      shop,
      orderGid: orderGid(Number(order.id)),
      orderNumericId: String(order.id),
      publicToken,
      expiresAt,
    },
  });

  if (settings.codSendSms) {
    const text = applyTemplate(settings.codSmsTemplate, vars);
    await client.sendSms({
      recipient: phone,
      message: text,
      mode: settings.defaultSmsMode === "credits" ? "credits" : "devices",
      sim: settings.defaultSmsDeviceId || undefined,
    });
  }

  if (settings.codSendWhatsapp && settings.defaultWaAccountId) {
    const text = applyTemplate(settings.codWaTemplate, vars);
    await client.sendWhatsapp({
      account: settings.defaultWaAccountId,
      recipient: phone,
      message: text,
      type: "text",
    });
  }

  await enqueueJob(shop, "cod_sync_contact", {
    orderId: String(order.id),
    phone,
  });
}

async function runAutomation(ctx: {
  shop: string;
  admin: AdminGraphql;
  key: string;
  order: Record<string, unknown>;
  settings: { encryptedWhatssmsSecret: string; marketingRequiresSmsConsent: boolean };
}): Promise<void> {
  const rule = await prisma.automation.findUnique({
    where: { shop_key: { shop: ctx.shop, key: ctx.key } },
  });
  if (!rule?.enabled) return;

  const phone = pickPhone(ctx.order);
  if (!phone) return;

  const cust = ctx.order.customer as Record<string, unknown> | undefined;
  const smsConsent = cust?.sms_marketing_consent as Record<string, unknown> | undefined;
  if (ctx.settings.marketingRequiresSmsConsent && smsConsent) {
    const state = (smsConsent.state as string)?.toLowerCase();
    if (state && state !== "subscribed") return;
  }

  const vars = buildOrderVars(ctx.order as Record<string, unknown>);
  await enqueueJob(ctx.shop, "automation_message", {
    key: ctx.key,
    orderId: ctx.order.id,
    phone,
    template: rule.template,
    sendSms: rule.sendSms,
    sendWa: rule.sendWa,
    smsMode: rule.smsMode,
    smsDevice: rule.smsDevice,
    waAccount: rule.waAccount,
    templateVars: vars,
  });
}
