import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { addOrderTagsIfMissing } from "../lib/order-tags.server";
import { confirmationTagForChannel } from "../lib/cod-detection.server";
import {
  appendOrderMerchantNote,
  cancelOrderCustomerReject,
  getOrderSummaryForCodPage,
} from "../lib/order-admin.server";

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (data?.status === "open" && data.summary) {
    return [{ title: `Confirm order · ${data.summary.shopName}` }];
  }
  return [{ title: "Order confirmation" }];
};

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
    decisionReferer: request.headers.get("referer"),
  };
}

function noteBlock(args: {
  decision: string;
  channel: string;
  ip: string | null;
  ua: string | null;
  lang: string | null;
  ref: string | null;
}): string {
  const lines = [
    `[WhatsSMS COD] ${args.decision} via ${args.channel}`,
    `IP: ${args.ip || "—"}`,
    `UA: ${(args.ua || "—").slice(0, 200)}`,
    `Lang: ${args.lang || "—"}`,
    `Referer: ${(args.ref || "—").slice(0, 200)}`,
  ];
  return lines.join("\n");
}

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
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
    return {
      status: "done" as const,
      action: row.resolvedAction as "confirm" | "reject",
      shop: row.shop,
      channel,
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
  const tag = confirmationTagForChannel(channel, decision as "confirm" | "reject");

  const updated = await prisma.codToken.updateMany({
    where: {
      publicToken,
      resolvedAction: null,
    },
    data: {
      resolvedAction: String(decision),
      resolvedAt: new Date(),
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
    return (
      <div className="cod-page">
        <div className="cod-card">
          <h1>Thank you</h1>
          <p>Your response has been recorded.</p>
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
            {s.lineItems.map((li, i) => (
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
