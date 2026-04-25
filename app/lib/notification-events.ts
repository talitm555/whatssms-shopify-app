export const NOTIFICATION_EVENT_OPTIONS = [
  { key: "customers/create", label: "Customer created" },
  { key: "orders/create", label: "Order created" },
  { key: "orders/updated", label: "Order updated" },
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
  "orders/create":
    "Hi {{customer_name}}, we received your order {{order_name}} for {{total}} {{currency}}. Thank you!",
  "orders/updated": "Update on your order {{order_name}} ({{financial_status}} / {{fulfillment_status}}).",
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
