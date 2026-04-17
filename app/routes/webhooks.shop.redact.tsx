import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload } = await authenticate.webhook(request);
  const p = payload as { shop_domain?: string };
  const shop = p.shop_domain || (payload as { shop?: string }).shop || "";
  if (!shop) return new Response();

  await prisma.$transaction([
    prisma.storedCustomerRef.deleteMany({ where: { shop } }),
    prisma.codToken.deleteMany({ where: { shop } }),
    prisma.automation.deleteMany({ where: { shop } }),
    prisma.webhookReceipt.deleteMany({ where: { shop } }),
    prisma.asyncJob.deleteMany({ where: { shop } }),
    prisma.shopSettings.deleteMany({ where: { shop } }),
    prisma.session.deleteMany({ where: { shop } }),
  ]);

  return new Response();
};
