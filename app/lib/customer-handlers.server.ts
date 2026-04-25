import type { TemplateVars } from "./template.server";

/** Build vars from Shopify `customers/create` REST payload + optional shop domain label. */
export function buildCustomerTemplateVars(
  payload: Record<string, unknown>,
  shopDomain: string,
): TemplateVars {
  const first = (payload.first_name as string) || "";
  const last = (payload.last_name as string) || "";
  const name =
    [first, last].filter(Boolean).join(" ") || (payload.email as string) || "";
  const shopLabel = shopDomain.replace(/\.myshopify\.com$/i, "");
  const shop_name = shopLabel
    ? shopLabel.charAt(0).toUpperCase() + shopLabel.slice(1)
    : shopDomain;
  return {
    customer_name: name,
    customer_first_name: first,
    customer_last_name: last,
    customer_email: String(payload.email || ""),
    customer_id: String(payload.id || ""),
    customer_phone: String(payload.phone || ""),
    shop_domain: shopDomain,
    shop_name,
    order_name: "",
    order_id: "",
    order_number: "",
    order_total: "",
    subtotal: "",
    total: "",
    currency: "",
  };
}
