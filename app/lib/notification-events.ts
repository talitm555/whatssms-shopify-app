/** App-defined key; automations are triggered when an `orders/updated` payload includes a COD confirmation tag (see `order-confirmation-tags.server.ts`). */
export const APP_ORDER_CONFIRMED_KEY = "app/order_confirmed" as const;

export const ABANDONED_CHECKOUT_EVENT_KEY = "checkouts/update" as const;

export const ABANDONED_CHECKOUT_DELAY_DEFAULT_MINUTES = 15;
export const ABANDONED_CHECKOUT_DELAY_MIN_MINUTES = 1;
export const ABANDONED_CHECKOUT_DELAY_MAX_MINUTES = 10080;

export function clampAbandonedCheckoutDelayMinutes(value: number): number {
  if (!Number.isFinite(value)) return ABANDONED_CHECKOUT_DELAY_DEFAULT_MINUTES;
  const n = Math.floor(value);
  return Math.min(
    ABANDONED_CHECKOUT_DELAY_MAX_MINUTES,
    Math.max(ABANDONED_CHECKOUT_DELAY_MIN_MINUTES, n),
  );
}

export function parseAbandonedCheckoutDelayMinutesForm(raw: string | null | undefined): number {
  const s = String(raw ?? "").trim();
  if (!s) return ABANDONED_CHECKOUT_DELAY_DEFAULT_MINUTES;
  return clampAbandonedCheckoutDelayMinutes(Number(s));
}

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
  [APP_ORDER_CONFIRMED_KEY]: `Hi {{customer_first_name}},
Thank you for confirming your order!
Here are the details:
{{order_name}}
{{line_items}}
{{order_total}}

We will notify you once your order has been shipped. If you have any questions, feel free to contact us.

Regards,
{{shop_name}}`,
  "checkouts/update": `Hi {{customer_first_name}},
You left {{line_items_count}} item(s) in your cart at {{shop_name}}.
Complete your order here:
{{abandoned_checkout_url}}

If you have any questions, feel free to contact us.

Regards,
{{shop_name}}`,
  "customers/create": `Welcome {{customer_first_name}}!
Thanks for creating an account with us.

If you have any questions, feel free to contact us.

Regards,
{{shop_name}}`,
  "fulfillments/create": `Hi {{customer_first_name}},
Your order {{order_name}} is on its way.
Tracking: {{tracking_number}} ({{tracking_company}}).

If you have any questions, feel free to contact us.

Regards,
{{shop_name}}`,
  "fulfillments/update": `Hi {{customer_first_name}},
Your order {{order_name}} has an updated tracking status.
Tracking: {{tracking_number}} ({{tracking_company}}).

If you have any questions, feel free to contact us.

Regards,
{{shop_name}}`,
  "orders/cancelled": `Hi {{customer_first_name}},
Your order {{order_name}} has been cancelled. 

If you have any questions, feel free to contact us.

Regards,
{{shop_name}}`,
  "orders/create": `Hi {{customer_first_name}},
Thank you for your order! Here are the details:
{{order_name}}
{{line_items}}
{{order_total}}

We will notify you once your order has been shipped. If you have any questions, feel free to contact us.

Regards,
{{shop_name}}`,
  "orders/fulfilled": `Hi {{customer_first_name}},
Your order {{order_name}} has been shipped.

Tracking: {{tracking_number}} ({{tracking_company}}).

If you have any questions, feel free to contact us.

Regards,
{{shop_name}}`,
  "orders/paid": `Hi {{customer_first_name}},
Thank you for your payment!
Your payment for order {{order_name}} has been received.

If you have any questions, feel free to contact us.

Regards,
{{shop_name}}`,
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
