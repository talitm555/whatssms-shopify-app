/**
 * COD / manual-payment detection from Shopify order payloads (REST webhook shape).
 * Gateways vary by market; combine gateway names + financial status heuristics.
 */

export type OrderWebhookLike = {
  financial_status?: string | null;
  payment_gateway_names?: string[] | null;
  transactions?: Array<{ gateway?: string | null; kind?: string | null }> | null;
};

const DEFAULT_COD_SUBSTRINGS = [
  "cod",
  "cash on delivery",
  "cash_on_delivery",
  "collect on delivery",
  "pay on delivery",
  "pod",
  "manual",
  "cash",
  "bank deposit",
  "money order",
];

function normalizeGateways(order: OrderWebhookLike): string[] {
  const names = (order.payment_gateway_names || []).map((g) => String(g).toLowerCase());
  const tx = order.transactions || [];
  for (const t of tx) {
    if (t.gateway) names.push(String(t.gateway).toLowerCase());
  }
  return names;
}

export function isLikelyCodOrder(
  order: OrderWebhookLike,
  extraGatewaySubstrings: string[] = [],
): boolean {
  const fin = (order.financial_status || "").toLowerCase();
  const gateways = normalizeGateways(order);
  const hints = [...DEFAULT_COD_SUBSTRINGS, ...extraGatewaySubstrings.map((s) => s.toLowerCase())];

  for (const g of gateways) {
    for (const h of hints) {
      if (g.includes(h)) return true;
    }
  }

  // Pending + manual-only checkout (common COD pattern)
  if (fin === "pending" && gateways.some((g) => g.includes("manual"))) {
    return true;
  }

  return false;
}

export function confirmationTagForChannel(
  channel: "sms" | "whatsapp",
  action: "confirm" | "reject",
): string {
  if (action === "confirm") {
    return channel === "sms" ? "confirmed_via_sms" : "confirmed_via_whatsapp";
  }
  return channel === "sms" ? "rejected_via_sms" : "rejected_via_whatsapp";
}
