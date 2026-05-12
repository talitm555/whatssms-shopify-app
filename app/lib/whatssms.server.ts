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
  private readonly apiBase: string;
  private readonly secret: string;

  constructor(apiBase: string, secret: string) {
    this.apiBase = apiBase;
    this.secret = secret;
  }

  private url(path: string, extra: Record<string, string> = {}): string {
    const u = new URL(joinBase(this.apiBase) + path);
    u.searchParams.set("secret", this.secret);
    for (const [k, v] of Object.entries(extra)) {
      if (v !== undefined && v !== null) u.searchParams.set(k, v);
    }
    return u.toString();
  }

  /**
   * Connectivity check — requires `get_shorteners` on the API key (Tools → API Keys).
   * Used to validate the secret without exposing credits or subscription data in the Shopify admin UI.
   */
  async getShorteners(): Promise<WhatssmsJson> {
    const res = await fetch(this.url("/api/get/shorteners"));
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

  /** Gateway + partner pricing — GET /api/get/rates (requires `get_rates` on the API key). */
  async getRates(): Promise<WhatssmsJson> {
    const res = await fetch(this.url("/api/get/rates"));
    return res.json() as Promise<WhatssmsJson>;
  }

  /** Single SMS — POST /api/send/sms (form data per docs). */
  async sendSms(params: {
    recipient: string;
    message: string;
    mode: "devices" | "credits";
    /** Linked Android device id (`mode=devices`). */
    device?: string;
    /** SIM slot **1** or **2** (`mode=devices` only). */
    sim?: string;
    /** Gateway id (int) or partner device `unique` (`mode=credits`). */
    gateway?: string;
    /** When set (e.g. `"1"`), sent as WhatsSMS `shortener` form field. Omit to disable. */
    shortener?: string;
    priority?: string;
  }): Promise<WhatssmsJson> {
    const body = new URLSearchParams();
    body.set("phone", params.recipient);
    body.set("message", params.message);
    body.set("mode", params.mode);
    if (params.mode === "devices") {
      if (params.device) body.set("device", params.device);
      const sim = params.sim === "1" || params.sim === "2" ? params.sim : "1";
      body.set("sim", sim);
      if (params.priority) body.set("priority", params.priority);
    } else {
      if (params.gateway) body.set("gateway", params.gateway);
    }
    if (params.shortener != null && params.shortener !== "") {
      body.set("shortener", params.shortener);
    }

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
    /** When set (e.g. `"1"`), sent as WhatsSMS `shortener` field. Omit to disable. */
    shortener?: string;
  }): Promise<WhatssmsJson> {
    const form = new FormData();
    form.set("account", params.account);
    form.set("recipient", params.recipient);
    form.set("message", params.message);
    form.set("type", params.type || "text");
    if (params.priority) form.set("priority", params.priority);
    if (params.shortener != null && params.shortener !== "") {
      form.set("shortener", params.shortener);
    }

    const u = new URL(joinBase(this.apiBase) + "/api/send/whatsapp");
    u.searchParams.set("secret", this.secret);

    const res = await fetch(u.toString(), { method: "POST", body: form });
    return res.json() as Promise<WhatssmsJson>;
  }
}

export function defaultWhatssmsBaseUrl(): string {
  return process.env.WHATSSMS_API_BASE_URL?.trim() || "https://app.whatssms.io";
}
