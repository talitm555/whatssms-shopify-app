/**
 * Documented template placeholders for SMS / WhatsApp templates.
 * Keep in sync with `buildOrderVars` / `buildFulfillmentTemplateVars` / customer vars.
 */
export const PLACEHOLDER_REFERENCE: ReadonlyArray<{
  key: string;
  description: string;
}> = [
  { key: "{{order_id}}", description: "Shopify order numeric id." },
  { key: "{{order_name}}", description: "Order name as shown in Admin (e.g. #1001)." },
  { key: "{{order_number}}", description: "Order number (without #)." },
  { key: "{{order_status_url}}", description: "Customer order status page URL when available." },
  { key: "{{order_total}}", description: "Legacy combined total + currency string." },
  { key: "{{subtotal}}", description: "Order subtotal amount." },
  { key: "{{total}}", description: "Order total amount." },
  { key: "{{currency}}", description: "Order currency code (e.g. USD)." },
  { key: "{{financial_status}}", description: "Order financial status." },
  { key: "{{fulfillment_status}}", description: "Order fulfillment status." },
  { key: "{{line_items}}", description: "Human-readable line items (qty × title per line)." },
  { key: "{{line_items_count}}", description: "Number of distinct line items." },
  { key: "{{order_note}}", description: "Merchant note on the order." },
  { key: "{{shipping_method}}", description: "First shipping line title." },
  { key: "{{customer_name}}", description: "Customer display name or email fallback." },
  { key: "{{customer_first_name}}", description: "Customer first name." },
  { key: "{{customer_last_name}}", description: "Customer last name." },
  { key: "{{customer_email}}", description: "Customer email." },
  { key: "{{customer_phone}}", description: "Best-effort phone from order / customer." },
  { key: "{{shipping_address}}", description: "Formatted shipping address." },
  { key: "{{shipping_city}}", description: "Shipping city." },
  { key: "{{shipping_country}}", description: "Shipping country." },
  { key: "{{shipping_zip}}", description: "Shipping postal / ZIP code." },
  { key: "{{billing_address}}", description: "Formatted billing address." },
  { key: "{{shop_name}}", description: "Shop display name." },
  { key: "{{shop_domain}}", description: "Shop domain (e.g. example.myshopify.com)." },
  { key: "{{confirm_url_sms}}", description: "COD confirmation link (SMS channel)." },
  { key: "{{confirm_url_wa}}", description: "COD confirmation link (WhatsApp channel)." },
  { key: "{{confirm_url}}", description: "Same as SMS confirmation URL (legacy)." },
  { key: "{{tracking_number}}", description: "Shipment tracking number (fulfillment webhooks)." },
  { key: "{{tracking_url}}", description: "Primary tracking URL (fulfillment webhooks)." },
  { key: "{{tracking_company}}", description: "Carrier / tracking company name." },
  { key: "{{abandoned_checkout_url}}", description: "Abandoned checkout recovery URL (if used)." },
  { key: "{{checkout_token}}", description: "Checkout token (abandoned checkout flows)." },
];
