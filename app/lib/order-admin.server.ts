import type { TemplateVars } from "./template.server";

type AdminGraphql = {
  graphql: (
    query: string,
    opts?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

function gidOrder(numericId: string | number): string {
  return `gid://shopify/Order/${numericId}`;
}

/** Friendly shop label from `*.myshopify.com` domain. */
export function shopLabelFromDomain(shop: string): string {
  const s = shop.replace(/\.myshopify\.com$/i, "");
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : shop;
}

export type CodOrderLineItem = {
  title: string;
  quantity: number;
  variantTitle: string | null;
  unitPrice: string;
  currencyCode: string;
  imageUrl: string | null;
};

export type CodOrderSummary = {
  shopName: string;
  shopDomain: string;
  shopLogoUrl: string | null;
  orderName: string;
  orderLegacyId: string | null;
  orderStatusUrl: string | null;
  orderNote: string | null;
  createdAt: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  email: string | null;
  phone: string | null;
  customerDisplayName: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  shippingLines: string[];
  shippingAddressLines: string[];
  billingAddressLines: string[];
  shippingCity: string | null;
  shippingCountry: string | null;
  shippingZip: string | null;
  lineItems: CodOrderLineItem[];
  subtotal: string;
  shippingTotal: string;
  taxTotal: string;
  total: string;
  currencyCode: string;
};

function moneyAmount(set: { shopMoney?: { amount?: string; currencyCode?: string } } | null | undefined): {
  amount: string;
  currency: string;
} {
  const m = set?.shopMoney;
  return { amount: String(m?.amount ?? "0"), currency: String(m?.currencyCode ?? "") };
}

function formatAddressLines(
  a: {
    name?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    address1?: string | null;
    address2?: string | null;
    city?: string | null;
    provinceCode?: string | null;
    zip?: string | null;
    countryCodeV2?: string | null;
  } | null | undefined,
): string[] {
  if (!a) return [];
  const name = [a.firstName, a.lastName].filter(Boolean).join(" ").trim() || a.name || "";
  const line1 = [a.address1, a.address2].filter(Boolean).join(", ");
  const line2 = [a.city, a.provinceCode, a.zip].filter(Boolean).join(", ");
  const line3 = a.countryCodeV2 || "";
  return [name, line1, line2, line3].filter((x) => x && String(x).trim());
}

export async function getOrderSummaryForCodPage(
  admin: AdminGraphql,
  orderGid: string,
  shopDomain: string,
): Promise<CodOrderSummary | null> {
  const fullQuery = `#graphql
    query OrderForCod($id: ID!) {
      shop {
        name
        primaryDomain { host }
      }
      order(id: $id) {
        name
        legacyResourceId
        createdAt
        email
        phone
        displayFinancialStatus
        displayFulfillmentStatus
        note
        subtotalPriceSet { shopMoney { amount currencyCode } }
        totalShippingPriceSet { shopMoney { amount currencyCode } }
        totalTaxSet { shopMoney { amount currencyCode } }
        totalPriceSet { shopMoney { amount currencyCode } }
        currencyCode
        customer {
          displayName
          firstName
          lastName
        }
        shippingAddress {
          name
          firstName
          lastName
          address1
          address2
          city
          provinceCode
          zip
          countryCodeV2
        }
        billingAddress {
          name
          firstName
          lastName
          address1
          address2
          city
          provinceCode
          zip
          countryCodeV2
        }
        lineItems(first: 50) {
          edges {
            node {
              title
              quantity
              variantTitle
              originalUnitPriceSet { shopMoney { amount currencyCode } }
              image { url }
            }
          }
        }
        shippingLines(first: 5) {
          edges {
            node {
              title
            }
          }
        }
      }
    }`;
  const fallbackQuery = `#graphql
    query OrderForCod($id: ID!) {
      shop {
        name
        primaryDomain { host }
      }
      order(id: $id) {
        name
        legacyResourceId
        createdAt
        email
        phone
        displayFinancialStatus
        displayFulfillmentStatus
        note
        subtotalPriceSet { shopMoney { amount currencyCode } }
        totalShippingPriceSet { shopMoney { amount currencyCode } }
        totalTaxSet { shopMoney { amount currencyCode } }
        totalPriceSet { shopMoney { amount currencyCode } }
        currencyCode
        customer {
          displayName
          firstName
          lastName
        }
        lineItems(first: 50) {
          edges {
            node {
              title
              quantity
              variantTitle
              originalUnitPriceSet { shopMoney { amount currencyCode } }
              image { url }
            }
          }
        }
        shippingLines(first: 5) {
          edges {
            node {
              title
            }
          }
        }
      }
    }`;
  let res: Response;
  try {
    res = await admin.graphql(fullQuery, { variables: { id: orderGid } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const protectedFieldDenied =
      msg.includes("not approved to use the address1 field") ||
      msg.includes("Access denied for") ||
      msg.includes("protected customer data");
    if (!protectedFieldDenied) throw error;
    res = await admin.graphql(fallbackQuery, { variables: { id: orderGid } });
  }
  const j = (await res.json()) as {
    data?: {
      shop?: {
        name?: string;
        primaryDomain?: { host?: string };
      };
      order?: Record<string, unknown>;
    };
    errors?: unknown;
  };
  const order = j?.data?.order;
  if (!order) return null;

  const shop = j.data?.shop;
  const shopName = String(shop?.name || shopLabelFromDomain(shopDomain));
  const shopHost = String(shop?.primaryDomain?.host || shopDomain);
  const logoUrl = null;

  const liEdges = (order.lineItems as { edges?: Array<{ node?: Record<string, unknown> }> })?.edges || [];
  const lineItems: CodOrderLineItem[] = liEdges.map(({ node: n }) => {
    const price = moneyAmount(
      n?.originalUnitPriceSet as { shopMoney?: { amount?: string; currencyCode?: string } },
    );
    const img = n?.image as { url?: string } | undefined;
    return {
      title: String(n?.title || ""),
      quantity: Number(n?.quantity || 0),
      variantTitle: n?.variantTitle ? String(n.variantTitle) : null,
      unitPrice: price.amount,
      currencyCode: price.currency || String(order.currencyCode || ""),
      imageUrl: img?.url ? String(img.url) : null,
    };
  });

  const shipEdges =
    (order.shippingLines as { edges?: Array<{ node?: { title?: string } }> })?.edges || [];
  const shippingLines = shipEdges.map((e) => String(e.node?.title || "")).filter(Boolean);

  const sub = moneyAmount(order.subtotalPriceSet as never);
  const ship = moneyAmount(order.totalShippingPriceSet as never);
  const tax = moneyAmount(order.totalTaxSet as never);
  const tot = moneyAmount(order.totalPriceSet as never);
  const cur = String(order.currencyCode || tot.currency || "");

  const cust = order.customer as Record<string, unknown> | undefined;
  const customerDisplay =
    (cust?.displayName as string) ||
    [cust?.firstName, cust?.lastName].filter(Boolean).join(" ").trim() ||
    null;

  const shipAddr = order.shippingAddress as {
    city?: string | null;
    countryCodeV2?: string | null;
    zip?: string | null;
  } | null;

  return {
    shopName,
    shopDomain: shopHost,
    shopLogoUrl: logoUrl,
    orderName: String(order.name || ""),
    orderLegacyId: order.legacyResourceId != null ? String(order.legacyResourceId) : null,
    orderStatusUrl: null,
    orderNote: order.note != null ? String(order.note) : null,
    createdAt: order.createdAt ? String(order.createdAt) : null,
    financialStatus: order.displayFinancialStatus ? String(order.displayFinancialStatus) : null,
    fulfillmentStatus: order.displayFulfillmentStatus ? String(order.displayFulfillmentStatus) : null,
    email: order.email ? String(order.email) : null,
    phone: order.phone ? String(order.phone) : null,
    customerDisplayName: customerDisplay,
    customerFirstName: cust?.firstName ? String(cust.firstName) : null,
    customerLastName: cust?.lastName ? String(cust.lastName) : null,
    shippingLines,
    shippingAddressLines: formatAddressLines(order.shippingAddress as never),
    billingAddressLines: formatAddressLines(order.billingAddress as never),
    shippingCity: shipAddr?.city ? String(shipAddr.city) : null,
    shippingCountry: shipAddr?.countryCodeV2 ? String(shipAddr.countryCodeV2) : null,
    shippingZip: shipAddr?.zip ? String(shipAddr.zip) : null,
    lineItems,
    subtotal: sub.amount,
    shippingTotal: ship.amount,
    taxTotal: tax.amount,
    total: tot.amount,
    currencyCode: cur,
  };
}

export async function fetchOrderTemplateVarsByNumericId(
  admin: AdminGraphql,
  orderNumericId: string | number,
  shopDomain: string,
): Promise<TemplateVars | null> {
  const summary = await getOrderSummaryForCodPage(admin, gidOrder(orderNumericId), shopDomain);
  if (!summary) return null;
  const lines = summary.lineItems
    .map((l) => `${l.quantity}× ${l.title}${l.variantTitle ? ` (${l.variantTitle})` : ""}`)
    .join("\n");
  return {
    shop_name: summary.shopName,
    shop_domain: summary.shopDomain,
    order_name: summary.orderName,
    order_id: String(orderNumericId),
    order_number: summary.orderLegacyId || summary.orderName.replace(/^#/, ""),
    order_total: `${summary.total} ${summary.currencyCode}`.trim(),
    subtotal: summary.subtotal,
    total: summary.total,
    currency: summary.currencyCode,
    financial_status: summary.financialStatus || "",
    fulfillment_status: summary.fulfillmentStatus || "",
    line_items: lines,
    line_items_count: String(summary.lineItems.length),
    order_note: summary.orderNote || "",
    shipping_method: summary.shippingLines[0] || "",
    customer_name: summary.customerDisplayName || "",
    customer_first_name: summary.customerFirstName || "",
    customer_last_name: summary.customerLastName || "",
    customer_email: summary.email || "",
    customer_phone: summary.phone || "",
    shipping_address: summary.shippingAddressLines.join("\n"),
    shipping_city: summary.shippingCity || "",
    shipping_country: summary.shippingCountry || "",
    shipping_zip: summary.shippingZip || "",
    billing_address: summary.billingAddressLines.join("\n"),
    order_status_url: summary.orderStatusUrl || "",
    tracking_number: "",
    tracking_url: "",
    tracking_company: "",
  };
}

export async function appendOrderMerchantNote(
  admin: AdminGraphql,
  orderGid: string,
  appendBlock: string,
): Promise<void> {
  const q = await admin.graphql(
    `#graphql
    query OrderNote($id: ID!) {
      order(id: $id) {
        note
      }
    }`,
    { variables: { id: orderGid } },
  );
  const jq = (await q.json()) as { data?: { order?: { note?: string | null } } };
  const existing = jq?.data?.order?.note || "";
  const next = existing
    ? `${existing.trim()}\n\n---\n${appendBlock.trim()}`
    : appendBlock.trim();

  const m = await admin.graphql(
    `#graphql
    mutation OrderNoteUpdate($input: OrderInput!) {
      orderUpdate(input: $input) {
        userErrors {
          field
          message
        }
      }
    }`,
    { variables: { input: { id: orderGid, note: next } } },
  );
  const jm = await m.json();
  const errs = jm?.data?.orderUpdate?.userErrors;
  if (errs?.length) {
    console.error("orderUpdate note errors", errs);
  }
}

/**
 * COD reject flow only (see `cod.$token` route). These orders are unpaid pending/manual capture;
 * there is no card capture to refund. `originalPaymentMethodsRefund: false` avoids instructing
 * Shopify to run a card refund that does not apply — merchants handle any settlement in admin if needed.
 */
export async function cancelOrderCustomerReject(
  admin: AdminGraphql,
  orderGid: string,
  staffNote: string,
): Promise<{ ok: boolean; error?: string }> {
  const note =
    staffNote.length > 255 ? `${staffNote.slice(0, 252)}...` : staffNote;
  const res = await admin.graphql(
    `#graphql
    mutation OrderCancelReject(
      $orderId: ID!
      $reason: OrderCancelReason!
      $notifyCustomer: Boolean!
      $refundMethod: OrderCancelRefundMethodInput!
      $restock: Boolean!
      $staffNote: String
    ) {
      orderCancel(
        orderId: $orderId
        reason: $reason
        notifyCustomer: $notifyCustomer
        refundMethod: $refundMethod
        restock: $restock
        staffNote: $staffNote
      ) {
        job {
          id
        }
        orderCancelUserErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        orderId: orderGid,
        reason: "CUSTOMER",
        notifyCustomer: true,
        refundMethod: { originalPaymentMethodsRefund: false },
        restock: true,
        staffNote: note,
      },
    },
  );
  const j = (await res.json()) as {
    data?: {
      orderCancel?: {
        orderCancelUserErrors?: Array<{ message?: string }>;
        job?: { id?: string };
      };
    };
    errors?: Array<{ message?: string }>;
  };
  if (j.errors?.length) {
    return { ok: false, error: j.errors.map((e) => e.message).join("; ") };
  }
  const ue = j.data?.orderCancel?.orderCancelUserErrors;
  if (ue?.length) {
    return { ok: false, error: ue.map((e) => e.message || "").join("; ") };
  }
  return { ok: true };
}
