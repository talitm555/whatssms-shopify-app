/**
 * WhatsSMS HTTP API client — paths match dashboard docs (/api/...).
 * Auth: `secret` query param (Tools → API Keys).
 * @see https://whatssms.io/dashboard/docs (or your tenant /dashboard/docs)
 */

export type WhatssmsJson = Record<string, unknown>;

function joinBase(base: string): string {
  return base.replace(/\/+$/, "");
}

export class WhatssmsClient {
  constructor(
    private readonly apiBase: string,
    private readonly secret: string,
  ) {}

  private url(path: string, extra: Record<string, string> = {}): string {
    const u = new URL(joinBase(this.apiBase) + path);
    u.searchParams.set("secret", this.secret);
    for (const [k, v] of Object.entries(extra)) {
      if (v !== undefined && v !== null) u.searchParams.set(k, v);
    }
    return u.toString();
  }

  async getCredits(): Promise<WhatssmsJson> {
    const res = await fetch(this.url("/api/get/credits"));
    return res.json() as Promise<WhatssmsJson>;
  }

  async getDevices(): Promise<WhatssmsJson> {
    const res = await fetch(this.url("/api/get/devices"));
    return res.json() as Promise<WhatssmsJson>;
  }

  async getWaAccounts(): Promise<WhatssmsJson> {
    const res = await fetch(this.url("/api/get/wa.accounts"));
    return res.json() as Promise<WhatssmsJson>;
  }

  /** Single SMS — POST /api/send/sms (form data per docs). */
  async sendSms(params: {
    recipient: string;
    message: string;
    mode: "devices" | "credits";
    sim?: string;
    shortener?: string;
    priority?: string;
  }): Promise<WhatssmsJson> {
    const body = new URLSearchParams();
    body.set("recipient", params.recipient);
    body.set("message", params.message);
    body.set("mode", params.mode);
    if (params.sim) body.set("sim", params.sim);
    if (params.shortener) body.set("shortener", params.shortener);
    if (params.priority) body.set("priority", params.priority);

    const res = await fetch(this.url("/api/send/sms"), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    return res.json() as Promise<WhatssmsJson>;
  }

  /** Single WhatsApp — POST /api/send/whatsapp (multipart in docs; URL-encoded works if API accepts). */
  async sendWhatsapp(params: {
    account: string;
    recipient: string;
    message: string;
    type?: string;
    priority?: string;
    shortener?: string;
  }): Promise<WhatssmsJson> {
    const form = new FormData();
    form.set("account", params.account);
    form.set("recipient", params.recipient);
    form.set("message", params.message);
    form.set("type", params.type || "text");
    if (params.priority) form.set("priority", params.priority);
    if (params.shortener) form.set("shortener", params.shortener);

    const u = new URL(joinBase(this.apiBase) + "/api/send/whatsapp");
    u.searchParams.set("secret", this.secret);

    const res = await fetch(u.toString(), { method: "POST", body: form });
    return res.json() as Promise<WhatssmsJson>;
  }
}

export function defaultWhatssmsBaseUrl(): string {
  return process.env.WHATSSMS_API_BASE_URL?.trim() || "https://app.whatssms.io";
}
