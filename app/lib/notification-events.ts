/** App-defined key; automations are triggered when an `orders/updated` payload includes a COD confirmation tag (see `order-confirmation-tags.server.ts`). */
export const APP_ORDER_CONFIRMED_KEY = "app/order_confirmed" as const;

export const NOTIFICATION_EVENT_OPTIONS = [
  { key: "customers/create", label: "Customer created" },
  { key: "checkouts/update", label: "Abandoned cart recovery" },
  { key: "orders/create", label: "Order created" },
  { key: APP_ORDER_CONFIRMED_KEY, label: "Order confirmed" },
  { key: "orders/paid", label: "Order paid" },
  { key: "orders/fulfilled", label: "Order fulfilled" },
  { key: "orders/cancelled", label: "Order cancelled" },
  { key: "fulfillments/create", label: "Shipment created" },
  { key: "fulfillments/update", label: "Shipment updated" },
] as const;

export type NotificationEventKey = (typeof NOTIFICATION_EVENT_OPTIONS)[number]["key"];

const DEFAULT_TEMPLATES: Record<NotificationEventKey, string> = {
  "customers/create":
    "Welcome {{customer_first_name}}! Thanks for creating an account with {{shop_name}}.",
  "checkouts/update":
    "Hi {{customer_first_name}}, you left {{line_items_count}} item(s) in your cart at {{shop_name}}. Complete your checkout here: {{abandoned_checkout_url}}",
  "orders/create":
    "Hi {{customer_name}}, we received your order {{order_name}} for {{total}} {{currency}}. Thank you!",
  [APP_ORDER_CONFIRMED_KEY]:
    "Your order {{order_name}} ({{order_total}}) is confirmed. Thank you, {{shop_name}}.",
  "orders/paid": "Payment confirmed for order {{order_name}} ({{total}} {{currency}}).",
  "orders/fulfilled": "Order {{order_name}} has shipped. Track: {{tracking_url}}",
  "orders/cancelled": "Order {{order_name}} has been cancelled.",
  "fulfillments/create":
    "Your order {{order_name}} is on its way. Tracking: {{tracking_number}} ({{tracking_company}}).",
  "fulfillments/update": "Tracking update for {{order_name}}: {{tracking_url}}.",
};

export function defaultTemplateForEvent(key: string): string {
  if (key in DEFAULT_TEMPLATES) {
    return DEFAULT_TEMPLATES[key as NotificationEventKey];
  }
  return "Message from {{shop_name}} regarding {{order_name}}.";
}

export function isNotificationEventKey(key: string): key is NotificationEventKey {
  return NOTIFICATION_EVENT_OPTIONS.some((e) => e.key === key);
}
