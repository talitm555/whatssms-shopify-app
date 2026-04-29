import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { addOrderTagsIfMissing } from "../lib/order-tags.server";
import { confirmationTagForChannel } from "../lib/cod-detection.server";
import {
  appendOrderMerchantNote,
  cancelOrderCustomerReject,
  type CodOrderLineItem,
  getOrderSummaryForCodPage,
} from "../lib/order-admin.server";
import { codRateLimitResponse } from "../lib/rate-limit.server";

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (data?.status === "open" && data.summary) {
    return [{ title: `Confirm order · ${data.summary.shopName}` }];
  }
  if (data?.status === "done") {
    const label = data.action === "confirm" ? "Order confirmed" : "Order rejected";
    const shopLabel = data.summary?.shopName?.trim();
    return [{ title: shopLabel ? `${label} · ${shopLabel}` : `${label} · Thank you` }];
  }
  return [{ title: "Order confirmation" }];
};

export function headers() {
  const csp = [
    "default-src 'none'",
    "base-uri 'none'",
    "connect-src 'self'",
    "font-src 'self' https://cdn.shopify.com data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' https: data:",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://cdn.shopify.com",
    "upgrade-insecure-requests",
  ].join("; ");

  return {
    "Content-Security-Policy": csp,
    "Permissions-Policy": "camera=(), microphone=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

function clientMetaFromRequest(request: Request): {
  decisionIp: string | null;
  decisionUserAgent: string | null;
  decisionLanguage: string | null;
  decisionReferer: string | null;
} {
  const fwd = request.headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
  return {
    decisionIp: ip,
    decisionUserAgent: request.headers.get("user-agent"),
    decisionLanguage: request.headers.get("accept-language"),
    decisionReferer: request.headers.get("referer") || request.url,
  };
}

function noteBlock(args: {
  decision: string;
  channel: string;
  ip: string | null;
  ua: string | null;
  lang: string | null;
  ref: string | null;
  at: Date;
}): string {
  const uaRaw = (args.ua || "").slice(0, 300);
  const isWhatsapp = args.channel === "whatsapp";
  const decisionLabel = args.decision === "confirm" ? "Confirmed" : "Rejected";
  const channelLabel = isWhatsapp ? "WhatsApp" : "SMS";
  const os = (() => {
    if (/Windows NT/i.test(uaRaw)) return "Windows";
    if (/Android/i.test(uaRaw)) return "Android";
    if (/(iPhone|iPad|iPod)/i.test(uaRaw)) return "iOS";
    if (/Mac OS X|Macintosh/i.test(uaRaw)) return "macOS";
    if (/Linux/i.test(uaRaw)) return "Linux";
    return "Unknown OS";
  })();
  const browser = (() => {
    const pick = (name: string, re: RegExp): string | null => {
      const m = uaRaw.match(re);
      if (!m?.[1]) return null;
      return `${name} ${m[1]}`;
    };
    return (
      pick("Edge", /Edg\/(\d+(?:\.\d+)?)/i) ||
      pick("Chrome", /Chrome\/(\d+(?:\.\d+)?)/i) ||
      pick("Firefox", /Firefox\/(\d+(?:\.\d+)?)/i) ||
      pick("Safari", /Version\/(\d+(?:\.\d+)?).*Safari/i) ||
      "Unknown Browser"
    );
  })();
  const when = args.at.toISOString().replace("T", " ").slice(0, 19);
  const lines = [
    `[WhatsSMS COD]`,
    `${decisionLabel} via ${channelLabel}`,
    `IP: ${args.ip || "—"}`,
    `Device: ${os}`,
    `Browser: ${browser}`,
    `DateTime: ${when} UTC`,
    `Language: ${args.lang || "—"}`,
    `Link: ${(args.ref || "—").slice(0, 300)}`,
    `User-Agent: ${uaRaw || "—"}`,
  ];
  return lines.join("\n");
}

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const limited = codRateLimitResponse(request, "read");
  if (limited) return limited;

  const publicToken = params.token;
  if (!publicToken) throw new Response("Not found", { status: 404 });

  const row = await prisma.codToken.findUnique({ where: { publicToken } });
  if (!row) throw new Response("Not found", { status: 404 });
  if (row.expiresAt.getTime() < Date.now()) {
    return { status: "expired" as const, shop: row.shop };
  }

  const url = new URL(request.url);
  const channel = url.searchParams.get("c") === "whatsapp" ? "whatsapp" : "sms";

  if (row.resolvedAction) {
    let summary: Awaited<ReturnType<typeof getOrderSummaryForCodPage>> = null;
    try {
      const { admin } = await unauthenticated.admin(row.shop);
      summary = await getOrderSummaryForCodPage(admin, row.orderGid, row.shop);
    } catch {
      summary = null;
    }
    return {
      status: "done" as const,
      action: row.resolvedAction as "confirm" | "reject",
      shop: row.shop,
      channel,
      resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
      summary,
    };
  }

  const { admin } = await unauthenticated.admin(row.shop);
  const summary = await getOrderSummaryForCodPage(admin, row.orderGid, row.shop);

  return {
    status: "open" as const,
    shop: row.shop,
    channel,
    summary,
    token: publicToken,
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const limited = codRateLimitResponse(request, "write");
  if (limited) return limited;

  const publicToken = params.token;
  if (!publicToken) throw new Response("Not found", { status: 404 });

  const form = await request.formData();
  const decision = form.get("decision");
  if (decision !== "confirm" && decision !== "reject") {
    throw new Response("Bad request", { status: 400 });
  }

  const ch = form.get("c");
  const channel = ch === "whatsapp" ? "whatsapp" : "sms";

  const row = await prisma.codToken.findUnique({ where: { publicToken } });
  if (!row) throw new Response("Not found", { status: 404 });
  if (row.expiresAt.getTime() < Date.now()) {
    throw new Response("Expired", { status: 410 });
  }

  const meta = clientMetaFromRequest(request);
  const decidedAt = new Date();
  const tag = confirmationTagForChannel(channel, decision as "confirm" | "reject");

  const updated = await prisma.codToken.updateMany({
    where: {
      publicToken,
      resolvedAction: null,
    },
    data: {
      resolvedAction: String(decision),
      resolvedAt: decidedAt,
      decisionIp: meta.decisionIp,
      decisionUserAgent: meta.decisionUserAgent,
      decisionLanguage: meta.decisionLanguage,
      decisionReferer: meta.decisionReferer,
    },
  });

  if (updated.count === 0) {
    return new Response(null, { status: 303, headers: { Location: `/cod/${publicToken}?c=${channel}` } });
  }

  const { admin } = await unauthenticated.admin(row.shop);
  await addOrderTagsIfMissing(admin, row.orderGid, [tag]);

  const staffBits = noteBlock({
    decision: String(decision),
    channel,
    ip: meta.decisionIp,
    ua: meta.decisionUserAgent,
    lang: meta.decisionLanguage,
    ref: meta.decisionReferer,
    at: decidedAt,
  });

  await appendOrderMerchantNote(admin, row.orderGid, staffBits);

  if (decision === "reject") {
    const cancel = await cancelOrderCustomerReject(admin, row.orderGid, staffBits.slice(0, 255));
    if (!cancel.ok) {
      console.error("orderCancel failed", cancel.error);
    }
  }

  return new Response(null, { status: 303, headers: { Location: `/cod/${publicToken}?c=${channel}` } });
};

export default function CodConfirmPage() {
  const data = useLoaderData<typeof loader>();

  if (data.status === "expired") {
    return (
      <div className="cod-page">
        <div className="cod-card">
          <h1>Link expired</h1>
          <p>This confirmation link is no longer valid.</p>
        </div>
      </div>
    );
  }

  if (data.status === "done") {
    const isConfirm = data.action === "confirm";
    const actionWord = isConfirm ? "confirmed" : "rejected";
    const tone = isConfirm ? "#008060" : "#d72c0d";
    const toneSurface = isConfirm ? "rgba(0, 128, 96, 0.08)" : "rgba(215, 44, 13, 0.08)";
    const toneBorder = isConfirm ? "rgba(0, 128, 96, 0.35)" : "rgba(215, 44, 13, 0.35)";
    const shopSlug = data.shop.replace(/\.myshopify\.com$/i, "");
    const shopDisplay =
      shopSlug.length > 0 ? shopSlug.charAt(0).toUpperCase() + shopSlug.slice(1) : data.shop;
    const channelLabel = data.channel === "whatsapp" ? "WhatsApp" : "SMS";
    return (
      <div className="cod-page cod-page--done">
        <style>{`
          .cod-page--done {
            font-family: Arial, Helvetica, sans-serif !important;
            background: #f1f1f1;
            min-height: 100vh;
            padding: 32px 16px 48px;
            color: #303030;
            -webkit-font-smoothing: antialiased;
          }
          .cod-page--done * {
            font-family: Arial, Helvetica, sans-serif !important;
          }
          .cod-done-card {
            max-width: 560px;
            margin: 0 auto;
            background: #fff;
            border-radius: 12px;
            box-shadow: 0 0 0 1px rgba(0,0,0,.06), 0 1px 3px rgba(0,0,0,.08);
            padding: 32px 28px 28px;
          }
          .cod-done-hero {
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            margin-bottom: 24px;
          }
          .cod-done-icon-wrap {
            width: 72px;
            height: 72px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 20px;
            box-shadow: inset 0 0 0 1px rgba(0,0,0,.04);
          }
          .cod-done-title {
            font-size: 1.25rem;
            font-weight: 650;
            letter-spacing: -0.02em;
            margin: 0 0 8px;
            line-height: 1.25;
            color: #202020;
          }
          .cod-done-sub {
            margin: 0;
            font-size: 0.9375rem;
            line-height: 1.45;
            color: #616161;
            max-width: 36em;
          }
          .cod-done-banner {
            margin-top: 24px;
            padding: 14px 16px;
            border-radius: 8px;
            border: 1px solid ${toneBorder};
            background: ${toneSurface};
            display: flex;
            gap: 12px;
            align-items: flex-start;
          }
          .cod-done-banner-icon {
            flex-shrink: 0;
            margin-top: 1px;
          }
          .cod-done-banner-body { min-width: 0; }
          .cod-done-banner-title {
            font-size: 0.8125rem;
            font-weight: 650;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: ${tone};
            margin: 0 0 4px;
          }
          .cod-done-banner-text {
            margin: 0;
            font-size: 0.9375rem;
            line-height: 1.45;
            color: #303030;
          }
          .cod-done-meta {
            margin-top: 24px;
            padding-top: 20px;
            border-top: 1px solid #e3e3e3;
          }
          .cod-done-meta-row {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            padding: 10px 0;
            font-size: 0.875rem;
            line-height: 1.4;
          }
          .cod-done-meta-row + .cod-done-meta-row { border-top: 1px solid #f1f1f1; }
          .cod-done-meta-label {
            flex: 0 0 108px;
            color: #616161;
            font-weight: 500;
          }
          .cod-done-meta-value {
            flex: 1;
            color: #303030;
            word-break: break-word;
          }
          .cod-done-meta-muted { color: #8a8a8a; font-style: italic; }
          .cod-done-order-wrap {
            margin-top: 4px;
            padding-top: 16px;
            border-top: 1px solid #e3e3e3;
          }
          .cod-done-order-heading {
            margin: 0 0 12px;
            font-size: 0.8125rem;
            font-weight: 650;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: #616161;
          }
          .cod-done-lines {
            list-style: none;
            margin: 0 0 12px;
            padding: 0;
          }
          .cod-done-lines li {
            display: flex;
            gap: 10px;
            padding: 8px 0;
            font-size: 0.8125rem;
            line-height: 1.35;
            border-bottom: 1px solid #f1f1f1;
            align-items: flex-start;
          }
          .cod-done-lines li:last-child { border-bottom: 0; }
          .cod-done-lines img {
            width: 36px;
            height: 36px;
            border-radius: 6px;
            object-fit: cover;
            background: #eee;
            flex-shrink: 0;
          }
          .cod-done-line-title { font-weight: 600; color: #303030; }
          .cod-done-line-meta { color: #616161; margin-top: 2px; font-size: 0.75rem; }
          .cod-done-total {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            font-weight: 650;
            font-size: 0.9375rem;
            margin-top: 4px;
            padding-top: 12px;
            border-top: 1px solid #eee;
            color: #202020;
          }
          .cod-done-status {
            margin-top: 10px;
            font-size: 0.8125rem;
            color: #616161;
            line-height: 1.4;
          }
          .cod-done-foot {
            margin-top: 28px;
            padding-top: 20px;
            border-top: 1px solid #e3e3e3;
            font-size: 0.8125rem;
            line-height: 1.45;
            color: #8a8a8a;
            text-align: center;
          }
        `}</style>
        <div className="cod-done-card">
          <div className="cod-done-hero">
            <div
              className="cod-done-icon-wrap"
              style={{ background: toneSurface }}
              aria-hidden
            >
              {isConfirm ? (
                <svg width="36" height="36" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    fill={tone}
                  />
                </svg>
              ) : (
                <svg width="36" height="36" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    fill={tone}
                  />
                </svg>
              )}
            </div>
            <h1 className="cod-done-title">Thank you</h1>
            <p className="cod-done-sub">
              Your response was sent to the store. Your order has been <strong>{actionWord}</strong> successfully.
            </p>
          </div>

          <div className="cod-done-banner" role="status">
            <span className="cod-done-banner-icon" aria-hidden>
              {isConfirm ? (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M10 2a8 8 0 100 16 8 8 0 000-16zm3.2 5.2l.9.9-5.5 5.5L6 11.9l.9-.9 1.7 1.7 4.6-4.5z"
                    fill={tone}
                  />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    fill={tone}
                  />
                </svg>
              )}
            </span>
            <div className="cod-done-banner-body">
              <p className="cod-done-banner-title">Response recorded</p>
              <p className="cod-done-banner-text">
                The merchant was notified. Channel: <strong>{channelLabel}</strong>.
              </p>
            </div>
          </div>

          <div className="cod-done-meta">
            <div className="cod-done-meta-row">
              <span className="cod-done-meta-label">Store</span>
              <span className="cod-done-meta-value">{shopDisplay}</span>
            </div>
            <div className="cod-done-meta-row">
              <span className="cod-done-meta-label">Shop domain</span>
              <span className="cod-done-meta-value">{data.shop}</span>
            </div>
            {data.summary ? (
              <div className="cod-done-order-wrap">
                <p className="cod-done-order-heading">Order details</p>
                <div className="cod-done-meta-row">
                  <span className="cod-done-meta-label">Order</span>
                  <span className="cod-done-meta-value">{data.summary.orderName}</span>
                </div>
                {data.summary.createdAt ? (
                  <div className="cod-done-meta-row">
                    <span className="cod-done-meta-label">Placed</span>
                    <span className="cod-done-meta-value">{new Date(data.summary.createdAt).toLocaleString()}</span>
                  </div>
                ) : null}
                {(data.summary.customerDisplayName || data.summary.email || data.summary.phone) && (
                  <>
                    <div className="cod-done-meta-row">
                      <span className="cod-done-meta-label">Name</span>
                      <span className="cod-done-meta-value">{data.summary.customerDisplayName || "—"}</span>
                    </div>
                    {data.summary.email ? (
                      <div className="cod-done-meta-row">
                        <span className="cod-done-meta-label">Email</span>
                        <span className="cod-done-meta-value">{data.summary.email}</span>
                      </div>
                    ) : null}
                    {data.summary.phone ? (
                      <div className="cod-done-meta-row">
                        <span className="cod-done-meta-label">Phone</span>
                        <span className="cod-done-meta-value">{data.summary.phone}</span>
                      </div>
                    ) : null}
                  </>
                )}
                {data.summary.shippingLines.length > 0 ? (
                  <div className="cod-done-meta-row">
                    <span className="cod-done-meta-label">Method</span>
                    <span className="cod-done-meta-value">{data.summary.shippingLines.join(", ")}</span>
                  </div>
                ) : null}
                {data.summary.lineItems.length > 0 ? (
                  <>
                    <p className="cod-done-order-heading" style={{ marginTop: 16 }}>
                      Line items
                    </p>
                    <ul className="cod-done-lines">
                      {data.summary.lineItems.map((li: CodOrderLineItem, i: number) => (
                        <li key={i}>
                          {li.imageUrl ? (
                            <img src={li.imageUrl} alt="" width={36} height={36} />
                          ) : (
                            <span style={{ width: 36, height: 36, borderRadius: 6, background: "#eee", flexShrink: 0 }} />
                          )}
                          <div style={{ minWidth: 0 }}>
                            <div className="cod-done-line-title">{li.title}</div>
                            {li.variantTitle ? (
                              <div className="cod-done-line-meta">{li.variantTitle}</div>
                            ) : null}
                            <div className="cod-done-line-meta">
                              Qty {li.quantity} × {li.unitPrice} {li.currencyCode}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <div className="cod-done-meta-row">
                      <span className="cod-done-meta-label">Subtotal</span>
                      <span className="cod-done-meta-value">
                        {data.summary.subtotal} {data.summary.currencyCode}
                      </span>
                    </div>
                    <div className="cod-done-meta-row">
                      <span className="cod-done-meta-label">Shipping</span>
                      <span className="cod-done-meta-value">
                        {data.summary.shippingTotal} {data.summary.currencyCode}
                      </span>
                    </div>
                    <div className="cod-done-meta-row">
                      <span className="cod-done-meta-label">Tax</span>
                      <span className="cod-done-meta-value">
                        {data.summary.taxTotal} {data.summary.currencyCode}
                      </span>
                    </div>
                    <div className="cod-done-total">
                      <span>Total</span>
                      <span>
                        {data.summary.total} {data.summary.currencyCode}
                      </span>
                    </div>
                  </>
                ) : null}
                {(data.summary.financialStatus || data.summary.fulfillmentStatus) && (
                  <p className="cod-done-status">
                    {data.summary.financialStatus ? <>Payment: {data.summary.financialStatus}</> : null}
                    {data.summary.financialStatus && data.summary.fulfillmentStatus ? " · " : null}
                    {data.summary.fulfillmentStatus ? <>Fulfillment: {data.summary.fulfillmentStatus}</> : null}
                  </p>
                )}
              </div>
            ) : (
              <div className="cod-done-order-wrap">
                <p className="cod-done-order-heading">Order details</p>
                <div className="cod-done-meta-row">
                  <span className="cod-done-meta-label">Order</span>
                  <span className="cod-done-meta-value cod-done-meta-muted">Could not load order details.</span>
                </div>
              </div>
            )}
            {data.resolvedAt ? (
              <div className="cod-done-meta-row">
                <span className="cod-done-meta-label">Recorded at</span>
                <span className="cod-done-meta-value">{new Date(data.resolvedAt).toLocaleString()}</span>
              </div>
            ) : null}
          </div>

          <p className="cod-done-foot">You can close this page. If you need help, contact the store directly.</p>
        </div>
      </div>
    );
  }

  const s = data.summary;
  if (!s) {
    return (
      <div className="cod-page">
        <div className="cod-card">
          <h1>Order unavailable</h1>
          <p>We could not load this order. Please contact the store.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cod-page">
      <style>{`
        .cod-page { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #f6f6f7; min-height: 100vh; padding: 24px 16px; }
        .cod-card { max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.08); padding: 24px; }
        .cod-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
        .cod-logo { width: 48px; height: 48px; border-radius: 8px; object-fit: cover; background: #eee; }
        .cod-shop { font-size: 1.1rem; font-weight: 600; }
        .cod-h1 { font-size: 1.35rem; margin: 0 0 8px; }
        .cod-muted { color: #555; font-size: 0.95rem; margin-bottom: 20px; }
        .cod-section { margin-top: 16px; }
        .cod-section h2 { font-size: 0.85rem; text-transform: uppercase; letter-spacing: .04em; color: #666; margin: 0 0 8px; }
        .cod-row { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px solid #eee; font-size: 0.95rem; }
        .cod-row:last-child { border-bottom: 0; }
        .cod-lines { margin: 0; padding: 0; list-style: none; }
        .cod-lines li { display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f0f0f0; align-items: flex-start; }
        .cod-lines img { width: 44px; height: 44px; border-radius: 6px; object-fit: cover; background: #eee; }
        .cod-total { display: flex; justify-content: space-between; font-weight: 700; margin-top: 12px; font-size: 1.05rem; }
        .cod-actions { display: flex; gap: 12px; margin-top: 24px; flex-wrap: wrap; }
        .cod-btn { flex: 1; min-width: 140px; border: 0; border-radius: 8px; padding: 14px 16px; font-size: 1rem; font-weight: 600; cursor: pointer; }
        .cod-btn-ok { background: #008060; color: #fff; }
        .cod-btn-bad { background: #d72c0d; color: #fff; }
      `}</style>
      <div className="cod-card">
        <div className="cod-header">
          {s.shopLogoUrl ? <img className="cod-logo" src={s.shopLogoUrl} alt="" /> : <div className="cod-logo" />}
          <div className="cod-shop">{s.shopName}</div>
        </div>
        <h1 className="cod-h1">Confirm your order</h1>
        <p className="cod-muted">
          Review your order below, then confirm or cancel. Order {s.orderName}
          {s.createdAt ? ` · ${new Date(s.createdAt).toLocaleString()}` : ""}
        </p>

        <div className="cod-section">
          <h2>Customer</h2>
          <div className="cod-row">
            <span>Name</span>
            <span>{s.customerDisplayName || "—"}</span>
          </div>
          <div className="cod-row">
            <span>Email</span>
            <span>{s.email || "—"}</span>
          </div>
          <div className="cod-row">
            <span>Phone</span>
            <span>{s.phone || "—"}</span>
          </div>
        </div>

        <div className="cod-section">
          <h2>Shipping</h2>
          {s.shippingLines.length > 0 && (
            <div className="cod-row">
              <span>Method</span>
              <span>{s.shippingLines.join(", ")}</span>
            </div>
          )}
          <div className="cod-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <span style={{ marginBottom: 4 }}>Address</span>
            <span style={{ whiteSpace: "pre-line" }}>
              {s.shippingAddressLines.length
                ? s.shippingAddressLines.join("\n")
                : "Not shared by store privacy settings"}
            </span>
          </div>
        </div>

        <div className="cod-section">
          <h2>Billing</h2>
          <div className="cod-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <span style={{ marginBottom: 4 }}>Address</span>
            <span style={{ whiteSpace: "pre-line" }}>
              {s.billingAddressLines.length
                ? s.billingAddressLines.join("\n")
                : "Not shared by store privacy settings"}
            </span>
          </div>
        </div>

        <div className="cod-section">
          <h2>Line items</h2>
          <ul className="cod-lines">
            {s.lineItems.map((li: CodOrderLineItem, i: number) => (
              <li key={i}>
                {li.imageUrl ? <img src={li.imageUrl} alt="" /> : <div className="cod-logo" style={{ width: 44, height: 44 }} />}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{li.title}</div>
                  {li.variantTitle ? (
                    <div className="cod-muted" style={{ margin: 0 }}>
                      {li.variantTitle}
                    </div>
                  ) : null}
                  <div className="cod-muted" style={{ margin: 0 }}>
                    Qty {li.quantity} × {li.unitPrice} {li.currencyCode}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="cod-section">
          <h2>Totals</h2>
          <div className="cod-row">
            <span>Subtotal</span>
            <span>
              {s.subtotal} {s.currencyCode}
            </span>
          </div>
          <div className="cod-row">
            <span>Shipping</span>
            <span>
              {s.shippingTotal} {s.currencyCode}
            </span>
          </div>
          <div className="cod-row">
            <span>Tax</span>
            <span>
              {s.taxTotal} {s.currencyCode}
            </span>
          </div>
          <div className="cod-total">
            <span>Total</span>
            <span>
              {s.total} {s.currencyCode}
            </span>
          </div>
          {(s.financialStatus || s.fulfillmentStatus) && (
            <p className="cod-muted" style={{ marginTop: 8 }}>
              {s.financialStatus ? <>Payment: {s.financialStatus}</> : null}
              {s.financialStatus && s.fulfillmentStatus ? " · " : null}
              {s.fulfillmentStatus ? <>Fulfillment: {s.fulfillmentStatus}</> : null}
            </p>
          )}
        </div>

        <Form method="post">
          <input type="hidden" name="c" value={data.channel} />
          <div className="cod-actions">
            <button className="cod-btn cod-btn-ok" type="submit" name="decision" value="confirm">
              Confirm order
            </button>
            <button className="cod-btn cod-btn-bad" type="submit" name="decision" value="reject">
              Reject order
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}
