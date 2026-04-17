import prisma from "../db.server";
import { decryptSecret } from "./crypto.server";
import { applyTemplate, type TemplateVars } from "./template.server";
import { defaultWhatssmsBaseUrl, WhatssmsClient } from "./whatssms.server";

export async function enqueueJob(
  shop: string,
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await prisma.asyncJob.create({
    data: {
      shop,
      type,
      payload: JSON.stringify(payload),
      status: "pending",
    },
  });

  setImmediate(() => {
    void processPendingJobs(shop).catch((e) => console.error("job processor", e));
  });
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
};

async function runAutomationMessageJob(shop: string, p: AutomationPayload): Promise<void> {
  const settings = await prisma.shopSettings.findUnique({ where: { shop } });
  if (!settings?.encryptedWhatssmsSecret) return;

  const secret = decryptSecret(settings.encryptedWhatssmsSecret);
  const base = settings.whatssmsApiBaseUrl || defaultWhatssmsBaseUrl();
  const client = new WhatssmsClient(base, secret);
  const text = applyTemplate(p.template, p.templateVars || {});

  if (p.sendSms) {
    await client.sendSms({
      recipient: p.phone,
      message: text,
      mode: p.smsMode === "credits" ? "credits" : "devices",
      sim: p.smsDevice || settings.defaultSmsDeviceId || undefined,
    });
  }
  if (p.sendWa && (p.waAccount || settings.defaultWaAccountId)) {
    await client.sendWhatsapp({
      account: String(p.waAccount || settings.defaultWaAccountId),
      recipient: p.phone,
      message: text,
      type: "text",
    });
  }
}
