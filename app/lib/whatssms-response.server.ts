import type { WhatssmsJson } from "./whatssms.server";

export function readWhatssmsEnvelope<T = unknown>(
  body: WhatssmsJson,
): { ok: boolean; data: T | null; message: string; status: number } {
  const status = Number((body as { status?: unknown }).status ?? 0);
  const ok = status === 200;
  const message = String((body as { message?: unknown }).message ?? "");
  const data = (body as { data?: unknown }).data as T | null | undefined;
  return { ok, data: data ?? null, message, status };
}

export function deviceSelectOptions(json: WhatssmsJson): { label: string; value: string }[] {
  const { ok, data } = readWhatssmsEnvelope<unknown[]>(json);
  if (!ok || !Array.isArray(data)) return [];
  const out: { label: string; value: string }[] = [];
  for (const d of data) {
    const row = d as Record<string, unknown>;
    const uniqueId = row.unique != null ? String(row.unique) : "";
    const fallbackId = row.id != null ? String(row.id) : "";
    const senderId = uniqueId || fallbackId;
    if (!senderId) continue;
    const name = row.name != null ? String(row.name) : `Device ${senderId}`;
    out.push({ label: `${name} (ID ${senderId})`, value: senderId });
  }
  return out;
}

export function waAccountSelectOptions(json: WhatssmsJson): { label: string; value: string }[] {
  const { ok, data } = readWhatssmsEnvelope<unknown[]>(json);
  if (!ok || !Array.isArray(data)) return [];
  const out: { label: string; value: string }[] = [];
  for (const d of data) {
    const row = d as Record<string, unknown>;
    const uniqueId = row.unique != null ? String(row.unique) : "";
    const fallbackId = row.id != null ? String(row.id) : "";
    const senderId = uniqueId || fallbackId;
    if (!senderId) continue;
    const phone = row.phone != null ? String(row.phone) : "";
    const status = row.status != null ? String(row.status) : "";
    out.push({
      label: `${phone || "Account"} — ${status} (ID ${senderId})`,
      value: senderId,
    });
  }
  return out;
}
