import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload } = await authenticate.webhook(request);
  const p = payload as {
    shop_domain?: string;
    customer?: { id?: number };
  };
  const shop = p.shop_domain || (payload as { shop?: string }).shop || "";
  const customerId = p.customer?.id;
  if (!shop || !customerId) {
    return new Response();
  }

  const gid = `gid://shopify/Customer/${customerId}`;
  await prisma.storedCustomerRef.deleteMany({
    where: { shop, customerGid: gid },
  });

  return new Response();
};
