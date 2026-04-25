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
    const id = row.id != null ? String(row.id) : "";
    if (!id) continue;
    const name = row.name != null ? String(row.name) : `Device ${id}`;
    out.push({ label: `${name} (ID ${id})`, value: id });
  }
  return out;
}

export function waAccountSelectOptions(json: WhatssmsJson): { label: string; value: string }[] {
  const { ok, data } = readWhatssmsEnvelope<unknown[]>(json);
  if (!ok || !Array.isArray(data)) return [];
  const out: { label: string; value: string }[] = [];
  for (const d of data) {
    const row = d as Record<string, unknown>;
    const id = row.id != null ? String(row.id) : "";
    if (!id) continue;
    const phone = row.phone != null ? String(row.phone) : "";
    const status = row.status != null ? String(row.status) : "";
    out.push({
      label: `${phone || "Account"} — ${status} (ID ${id})`,
      value: id,
    });
  }
  return out;
}
