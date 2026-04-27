import { randomBytes } from "crypto";
import prisma from "../db.server";
import { decryptSecret } from "./crypto.server";
import { isLikelyCodOrder } from "./cod-detection.server";
import { applyTemplate, type TemplateVars } from "./template.server";
import { defaultWhatssmsBaseUrl, WhatssmsClient } from "./whatssms.server";
import { enqueueJob } from "./jobs.server";
import { buildCustomerTemplateVars } from "./customer-handlers.server";
import { orderPayloadHasConfirmationTag } from "./order-confirmation-tags.server";
import { fetchOrderTemplateVarsByNumericId } from "./order-admin.server";
import { APP_ORDER_CONFIRMED_KEY } from "./notification-events";
import { consumeWebhookOnce } from "./webhook-idempotency.server";

type AdminGraphql = {
  graphql: (
    query: string,
    opts?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

/** Normalize Shopify webhook topic to `orders/create` style keys used in `Automation.key`. */
export function webhookTopicToSlashed(topic: string): string {
  if (topic.includes("/")) return topic.toLowerCase();
  const idx = topic.lastIndexOf("_");
  if (idx === -1) return topic.toLowerCase();
  const resource = topic.slice(0, idx).toLowerCase();
  const action = topic.slice(idx + 1).toLowerCase();
  return `${resource}/${action}`;
}

function orderGid(numericId: number | string): string {
  return `gid://shopify/Order/${numericId}`;
}

export function pickPhone(order: Record<string, unknown>): string | null {
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

function pickPhoneFromCustomer(payload: Record<string, unknown>): string | null {
  if (payload.phone) return String(payload.phone);
  const addrs = (payload.addresses as Array<Record<string, unknown>>) || [];
  for (const a of addrs) {
    if (a?.phone) return String(a.phone);
  }
  return null;
}

function pickPhoneFromFulfillment(payload: Record<string, unknown>): string | null {
  const dest = payload.destination as Record<string, unknown> | undefined;
  if (dest?.phone) return String(dest.phone);
  return null;
}

function formatAddressLinesFromRest(addr: Record<string, unknown> | undefined): string {
  if (!addr) return "";
  const lines = [
    [addr.first_name, addr.last_name].filter(Boolean).join(" "),
    [addr.address1, addr.address2].filter(Boolean).join(" "),
    [addr.city, addr.province || addr.province_code, addr.zip].filter(Boolean).join(", "),
    addr.country,
  ].filter((x) => x && String(x).trim());
  return lines.join("\n");
}

function formatLineItemsRest(order: Record<string, unknown>): string {
  const items = (order.line_items as Array<Record<string, unknown>>) || [];
  return items
    .map((li) => {
      const q = Number(li.quantity || 0);
      const t = String(li.title || "");
      return `${q}× ${t}`;
    })
    .join("\n");
}

function checkoutToken(payload: Record<string, unknown>): string {
  const raw = payload.token ?? payload.checkout_token ?? payload.cart_token;
  return raw == null ? "" : String(raw).trim();
}

export function buildOrderVars(
  order: Record<string, unknown>,
  shop: string,
  extra: TemplateVars = {},
): TemplateVars {
  const customer = (order.customer as Record<string, unknown>) || {};
  const ship = order.shipping_address as Record<string, unknown> | undefined;
  const bill = order.billing_address as Record<string, unknown> | undefined;
  const first = String(customer.first_name || ship?.first_name || bill?.first_name || "");
  const last = String(customer.last_name || ship?.last_name || bill?.last_name || "");
  const name =
    [first, last].filter(Boolean).join(" ") ||
    String(customer.email || order.email || "") ||
    "";
  const shippingLines = (order.shipping_lines as Array<Record<string, unknown>>) || [];
  const firstShipTitle = shippingLines[0]?.title;

  const shopLabel = shop.replace(/\.myshopify\.com$/i, "");
  const shop_name = shopLabel
    ? shopLabel.charAt(0).toUpperCase() + shopLabel.slice(1)
    : shop;

  const subtotal = String(order.subtotal_price ?? "");
  const total = String(order.total_price ?? "");
  const cur = String(order.currency || "");
  const orderName = String(order.name || "");
  const orderNumRaw = order.order_number;
  const order_number =
    orderNumRaw !== undefined && orderNumRaw !== null
      ? String(orderNumRaw)
      : orderName.replace(/^#/, "");

  return {
    order_id: String(order.id ?? ""),
    order_name: orderName,
    order_number,
    order_status_url: String(order.order_status_url || ""),
    order_total: `${total} ${cur}`.trim(),
    subtotal,
    total,
    currency: cur,
    financial_status: String(order.financial_status || ""),
    fulfillment_status: String(order.fulfillment_status || ""),
    line_items: formatLineItemsRest(order),
    line_items_count: String(Array.isArray(order.line_items) ? order.line_items.length : 0),
    order_note: String(order.note || ""),
    shipping_method: firstShipTitle ? String(firstShipTitle) : "",
    customer_name: name,
    customer_first_name: first,
    customer_last_name: last,
    customer_email: String(customer.email || order.email || ""),
    customer_phone: pickPhone(order) || "",
    shipping_address: formatAddressLinesFromRest(ship),
    shipping_city: ship?.city ? String(ship.city) : "",
    shipping_country: ship?.country ? String(ship.country) : "",
    shipping_zip: ship?.zip ? String(ship.zip) : "",
    billing_address: formatAddressLinesFromRest(bill),
    shop_order_id: String(order.id ?? ""),
    shop_name,
    shop_domain: shop,
    tracking_number: "",
    tracking_url: "",
    tracking_company: "",
    ...extra,
  };
}

async function resolvePhoneForTopic(
  topic: string,
  payload: Record<string, unknown>,
  admin: AdminGraphql | undefined,
  shop: string,
): Promise<string | null> {
  if (topic === "customers/create") {
    return pickPhoneFromCustomer(payload);
  }
  if (topic.startsWith("fulfillments/")) {
    const fromDest = pickPhoneFromFulfillment(payload);
    if (fromDest) return fromDest;
    const oid = payload.order_id;
    if (admin && oid != null) {
      const vars = await fetchOrderTemplateVarsByNumericId(admin, String(oid), shop);
      const p = vars?.customer_phone;
      return p ? String(p) : null;
    }
    if (oid != null && !admin) {
      console.warn(
        "[whatssms] fulfillment webhook: no admin session; cannot load phone from order",
        { shop, topic, order_id: oid },
      );
    }
    return null;
  }
  return pickPhone(payload);
}

export function isAbandonedCheckoutPayload(payload: Record<string, unknown>): boolean {
  if (payload.completed_at) return false;
  const recoveryUrl = String(payload.abandoned_checkout_url || "").trim();
  return recoveryUrl.length > 0;
}

async function buildTemplateVarsForTopic(
  shop: string,
  admin: AdminGraphql | undefined,
  topic: string,
  payload: Record<string, unknown>,
): Promise<TemplateVars> {
  if (topic === "customers/create") {
    return buildCustomerTemplateVars(payload, shop);
  }
  if (topic === "checkouts/update") {
    return buildOrderVars(payload, shop, {
      checkout_token: checkoutToken(payload),
      abandoned_checkout_url: String(payload.abandoned_checkout_url || ""),
    });
  }
  if (topic.startsWith("fulfillments/")) {
    const oid = payload.order_id;
    let base: TemplateVars = {
      shop_domain: shop,
      shop_name: shop.replace(/\.myshopify\.com$/i, "") || shop,
    };
    if (admin && oid != null) {
      const fetched = await fetchOrderTemplateVarsByNumericId(admin, String(oid), shop);
      if (fetched) base = { ...fetched, ...base };
    }
    const tracks = payload.tracking_urls as unknown;
    const urls = Array.isArray(tracks) ? (tracks as string[]) : [];
    return {
      ...base,
      tracking_number: String(payload.tracking_number || ""),
      tracking_company: String(payload.tracking_company || ""),
      tracking_url: urls[0] || "",
    };
  }
  return buildOrderVars(payload, shop, {});
}

/**
 * Sends a queued WhatsSMS message when an `Automation` row exists for this shop + webhook topic.
 */
export async function runNotificationForEvent(
  shop: string,
  admin: AdminGraphql | undefined,
  topicRaw: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const topic = webhookTopicToSlashed(topicRaw);
  const settings = await prisma.shopSettings.findUnique({ where: { shop } });
  if (!settings?.encryptedWhatssmsSecret) return;

  const rule = await prisma.automation.findUnique({
    where: { shop_key: { shop, key: topic } },
  });
  if (!rule?.enabled) return;

  const phone = await resolvePhoneForTopic(topic, payload, admin, shop);
  if (!phone) return;

  const sendSms = rule.sendSms;
  const sendWa = rule.sendWa;
  if (!sendSms && !sendWa) return;

  if (topic === "checkouts/update") {
    const token = checkoutToken(payload);
    if (!token) return;
    // Strict dedupe: once per shop + checkout token, only after rule + phone are valid.
    const dedupeId = `abandoned-checkout:${shop}:${token}`;
    const firstForCheckout = await consumeWebhookOnce(shop, topic, dedupeId);
    if (!firstForCheckout) return;
  }

  const templateVars = await buildTemplateVarsForTopic(shop, admin, topic, payload);

  await enqueueJob(shop, "automation_message", {
    key: topic,
    orderId: payload.id ?? payload.order_id,
    phone,
    template: rule.template,
    sendSms,
    sendWa,
    smsMode: rule.smsMode,
    smsDevice: rule.smsDevice,
    waAccount: rule.waAccount,
    templateVars,
  });
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
  const encSecret = settings?.encryptedWhatssmsSecret;
  if (!settings || !encSecret) return;

  const order = payload;
  const hints =
    settings.codGatewayHints?.split(",").map((s) => s.trim()).filter(Boolean) || [];

  const cod = settings.codEnabled && isLikelyCodOrder(order as never, hints);

  if (cod) {
    await sendCodConfirmationFlow({
      shop,
      admin,
      order,
      settings: { ...settings, encryptedWhatssmsSecret: encSecret },
    });
  }

  await runNotificationForEvent(shop, admin, "orders/create", order);
}

/**
 * `orders/updated` is the only Shopify topic for this flow; the merchant-facing automation key is `app/order_confirmed`
 * and runs only when `confirmed_via_sms` or `confirmed_via_whatsapp` is present (COD public link), once per order.
 */
export async function handleOrderUpdated(
  shop: string,
  admin: AdminGraphql | undefined,
  payload: Record<string, unknown>,
): Promise<void> {
  const settings = await prisma.shopSettings.findUnique({ where: { shop } });
  if (!settings?.encryptedWhatssmsSecret) return;
  if (!orderPayloadHasConfirmationTag(payload)) return;

  const topic = webhookTopicToSlashed(APP_ORDER_CONFIRMED_KEY);
  const rule = await prisma.automation.findUnique({
    where: { shop_key: { shop, key: topic } },
  });
  if (!rule?.enabled) return;

  const phone = await resolvePhoneForTopic(topic, payload, admin, shop);
  if (!phone) return;

  const idRaw = payload.id;
  if (idRaw == null) return;
  const orderNumericId = String(idRaw);

  const insert = await prisma.orderConfirmationNotification.createMany({
    data: [{ shop, orderNumericId }],
    skipDuplicates: true,
  });
  if (insert.count === 0) return;

  await runNotificationForEvent(shop, admin, APP_ORDER_CONFIRMED_KEY, payload);
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
    urlShortenerSms: boolean;
    urlShortenerWhatsapp: boolean;
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

  const vars = buildOrderVars(order, shop, {
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
      ...(settings.urlShortenerSms ? { shortener: "1" } : {}),
    });
  }

  if (settings.codSendWhatsapp && settings.defaultWaAccountId) {
    const text = applyTemplate(settings.codWaTemplate, vars);
    await client.sendWhatsapp({
      account: settings.defaultWaAccountId,
      recipient: phone,
      message: text,
      type: "text",
      ...(settings.urlShortenerWhatsapp ? { shortener: "1" } : {}),
    });
  }

  await enqueueJob(shop, "cod_sync_contact", {
    orderId: String(order.id),
    phone,
  });
}
