import prisma from "../db.server";
import { decryptSecret } from "./crypto.server";
import { applyTemplate, type TemplateVars } from "./template.server";
import { defaultWhatssmsBaseUrl, WhatssmsClient } from "./whatssms.server";
import { readWhatssmsEnvelope } from "./whatssms-response.server";

type AutomationPayload = {
  key: string;
  phone: string;
  template: string;
  sendSms: boolean;
  sendWa: boolean;
  smsMode?: string | null;
  smsDevice?: string | null;
  waAccount?: string | null;
  templateVars?: TemplateVars;
  orderId?: unknown;
  /** When set, job is a deferred abandoned-checkout reminder (see `scheduleOrBumpDeferredAbandonedCheckoutJob`). */
  abandonedCheckoutDefer?: boolean;
  abandonedCheckoutToken?: string;
};

type DeferredAbandonedPayload = AutomationPayload & {
  abandonedCheckoutDefer: true;
  abandonedCheckoutToken: string;
};

export async function enqueueJob(
  shop: string,
  type: string,
  payload: Record<string, unknown>,
  options?: { runAfter?: Date },
): Promise<void> {
  const runAfter = options?.runAfter ?? new Date();
  await prisma.asyncJob.create({
    data: {
      shop,
      type,
      payload: JSON.stringify(payload),
      status: "pending",
      runAfter,
    },
  });

  // Do not run the processor immediately for future-dated jobs: it would still drain
  // *other* due jobs for this shop (e.g. stale abandoned-checkout rows), causing an
  // "instant" recovery while a new deferred job is scheduled for later.
  const wakeImmediately = runAfter.getTime() <= Date.now() + 2_000;
  if (!wakeImmediately) {
    return;
  }

  setImmediate(() => {
    void processPendingJobs(shop).catch((e) => console.error("job processor", e));
  });
}

function parseJobPayload(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function findPendingDeferredAbandonedCheckoutJob(
  shop: string,
  token: string,
): Promise<{ id: string } | null> {
  const jobs = await prisma.asyncJob.findMany({
    where: { shop, status: "pending", type: "automation_message" },
    orderBy: { createdAt: "desc" },
    take: 80,
    select: { id: true, payload: true },
  });
  for (const j of jobs) {
    const p = parseJobPayload(j.payload);
    if (!p) continue;
    if (p.abandonedCheckoutDefer === true && p.abandonedCheckoutToken === token) {
      return { id: j.id };
    }
  }
  return null;
}

/**
 * One pending reminder per shop + checkout token. Each new `checkouts/update` bumps
 * `runAfter` so we do not message while the customer is still editing checkout.
 */
export async function scheduleOrBumpDeferredAbandonedCheckoutJob(
  shop: string,
  payload: DeferredAbandonedPayload,
  delayMinutes: number,
): Promise<void> {
  const token = payload.abandonedCheckoutToken;
  const ms = Math.max(60_000, Math.floor(delayMinutes) * 60_000);
  const runAfter = new Date(Date.now() + ms);
  const existing = await findPendingDeferredAbandonedCheckoutJob(shop, token);
  if (existing) {
    await prisma.asyncJob.update({
      where: { id: existing.id },
      data: {
        runAfter,
        payload: JSON.stringify(payload),
        lastError: null,
      },
    });
    return;
  }
  await enqueueJob(shop, "automation_message", payload, { runAfter });
}

export async function cancelDeferredAbandonedCheckoutJobs(
  shop: string,
  token: string,
): Promise<void> {
  if (!token) return;
  const jobs = await prisma.asyncJob.findMany({
    where: { shop, status: "pending", type: "automation_message" },
    select: { id: true, payload: true },
    take: 100,
  });
  const ids = jobs
    .filter((j) => {
      const p = parseJobPayload(j.payload);
      return Boolean(p?.abandonedCheckoutDefer && p.abandonedCheckoutToken === token);
    })
    .map((j) => j.id);
  if (ids.length === 0) return;
  await prisma.asyncJob.deleteMany({ where: { id: { in: ids } } });
}

/**
 * Processes pending jobs (best-effort). For production, run a dedicated worker
 * or external queue (SQS, pg-boss, Sidekiq, etc.).
 */
export async function processPendingJobs(shop?: string): Promise<void> {
  const pending = await prisma.asyncJob.findMany({
    where: {
      status: "pending",
      ...(shop ? { shop } : {}),
      runAfter: { lte: new Date() },
    },
    take: 25,
    orderBy: { createdAt: "asc" },
  });

  for (const job of pending) {
    const updated = await prisma.asyncJob.update({
      where: { id: job.id },
      data: { status: "processing", attempts: { increment: 1 } },
    });
    try {
      if (job.type === "automation_message") {
        await runAutomationMessageJob(job.shop, JSON.parse(job.payload) as AutomationPayload);
      }
      await prisma.asyncJob.update({
        where: { id: job.id },
        data: { status: "done", lastError: null },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const attempts = updated.attempts;
      await prisma.asyncJob.update({
        where: { id: job.id },
        data: {
          status: attempts >= 4 ? "failed" : "pending",
          lastError: msg,
          runAfter: new Date(Date.now() + 60_000 * attempts),
        },
      });
    }
  }
}

async function runAutomationMessageJob(shop: string, p: AutomationPayload): Promise<void> {
  const settings = await prisma.shopSettings.findUnique({ where: { shop } });
  if (!settings?.encryptedWhatssmsSecret) return;

  const secret = decryptSecret(settings.encryptedWhatssmsSecret);
  const base = settings.whatssmsApiBaseUrl || defaultWhatssmsBaseUrl();
  const client = new WhatssmsClient(base, secret);
  const text = applyTemplate(p.template, p.templateVars || {});

  if (p.sendSms) {
    const smsRes = await client.sendSms({
      recipient: p.phone,
      message: text,
      mode: p.smsMode === "credits" ? "credits" : "devices",
      sim: p.smsDevice || settings.defaultSmsDeviceId || undefined,
      ...(settings.urlShortenerSms ? { shortener: "1" } : {}),
    });
    const smsEnv = readWhatssmsEnvelope(smsRes);
    if (!smsEnv.ok) {
      throw new Error(`WhatsSMS SMS send failed (${smsEnv.status}): ${smsEnv.message || "unknown error"}`);
    }
  }
  if (p.sendWa && (p.waAccount || settings.defaultWaAccountId)) {
    const waRes = await client.sendWhatsapp({
      account: String(p.waAccount || settings.defaultWaAccountId),
      recipient: p.phone,
      message: text,
      type: "text",
      ...(settings.urlShortenerWhatsapp ? { shortener: "1" } : {}),
    });
    const waEnv = readWhatssmsEnvelope(waRes);
    if (!waEnv.ok) {
      throw new Error(`WhatsSMS WhatsApp send failed (${waEnv.status}): ${waEnv.message || "unknown error"}`);
    }
  }
}

/** Poll interval so deferred jobs (e.g. abandoned checkout) run after `runAfter` without another webhook. */
const ASYNC_JOB_SWEEP_MS = 15_000;

function startAsyncJobSweepIfNeeded(): void {
  if (process.env.NODE_ENV === "test") return;
  if (typeof setInterval === "undefined") return;
  const g = globalThis as typeof globalThis & { __whatssmsAsyncJobSweepStarted?: boolean };
  if (g.__whatssmsAsyncJobSweepStarted) return;
  g.__whatssmsAsyncJobSweepStarted = true;
  setInterval(() => {
    void processPendingJobs().catch((e) => console.error("async job sweep", e));
  }, ASYNC_JOB_SWEEP_MS);
}

startAsyncJobSweepIfNeeded();
