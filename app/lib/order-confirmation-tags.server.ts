import { confirmationTagForChannel } from "./cod-detection.server";

const SMS = confirmationTagForChannel("sms", "confirm");
const WHATSAPP = confirmationTagForChannel("whatsapp", "confirm");

const CONFIRMATION_TAGS = new Set([SMS, WHATSAPP]);

export function parseOrderTagsField(tags: unknown): string[] {
  if (typeof tags !== "string" || !tags.trim()) return [];
  return tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/** True when the REST order webhook payload includes a COD confirmation tag (customer confirmed via the public link). */
export function orderPayloadHasConfirmationTag(order: Record<string, unknown>): boolean {
  const list = parseOrderTagsField(order.tags);
  for (const t of list) {
    if (CONFIRMATION_TAGS.has(t)) return true;
  }
  return false;
}
