/** Maps WhatsSMS `/api/get/subscription` usage keys to readable labels. */
export const WHATSMS_USAGE_LABEL: Record<string, string> = {
  sms_send: "SMS Sent",
  sms_receive: "SMS Received",
  ussd: "USSD",
  contacts: "Contacts",
  devices: "Android Devices",
  apikeys: "API Keys",
  webhooks: "Webhooks",
  actions: "Actions",
  groups: "Groups",
  templates: "Templates",
  flows: "Flows",
  ai_keys: "AI Keys",
  ai_plugins: "AI Plugins",
  scheduled: "Scheduled Messages",
  wa_send: "WhatsApp Messages Sent",
  wa_receive: "WhatsApp Messages Received",
  wa_accounts: "WhatsApp Accounts",
};

/** Preferred display order (keys from API); unknown keys sort after these. */
export const WHATSMS_USAGE_ORDER: string[] = [
  "sms_send",
  "sms_receive",
  "ussd",
  "contacts",
  "devices",
  "apikeys",
  "webhooks",
  "actions",
  "groups",
  "templates",
  "flows",
  "ai_keys",
  "ai_plugins",
  "scheduled",
  "wa_send",
  "wa_receive",
  "wa_accounts",
];

export function labelForUsageKey(key: string): string {
  return WHATSMS_USAGE_LABEL[key] ?? titleCaseFromSnake(key);
}

function titleCaseFromSnake(key: string): string {
  return key
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** `limit === 0` from API means unlimited quota. */
export function formatUsageLimit(limit: number): string {
  if (!Number.isFinite(limit) || limit <= 0) return "Unlimited";
  return String(limit);
}

export function sortUsageEntries(
  entries: [string, { used?: number; limit?: number }][],
): void {
  entries.sort((a, b) => {
    const ia = WHATSMS_USAGE_ORDER.indexOf(a[0]);
    const ib = WHATSMS_USAGE_ORDER.indexOf(b[0]);
    if (ia === -1 && ib === -1) return a[0].localeCompare(b[0]);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}
