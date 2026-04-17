import prisma from "../db.server";

export async function consumeWebhookOnce(
  shop: string,
  topic: string,
  webhookId: string,
  payloadHash?: string,
): Promise<boolean> {
  try {
    await prisma.webhookReceipt.create({
      data: { shop, topic, webhookId, payloadHash: payloadHash ?? null },
    });
    return true;
  } catch {
    return false;
  }
}
