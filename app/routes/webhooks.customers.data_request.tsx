import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

/**
 * Mandatory for public apps (customer data export request).
 * Return any stored PII for the customer.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload } = await authenticate.webhook(request);
  const p = payload as {
    shop_id?: number;
    shop_domain?: string;
    customer?: { id?: number; email?: string };
    orders_requested?: number[];
  };
  const shop = p.shop_domain || (payload as { shop?: string }).shop || "";
  const customerId = p.customer?.id;
  if (!shop || !customerId) {
    return new Response();
  }

  const gid = `gid://shopify/Customer/${customerId}`;
  const refs = await prisma.storedCustomerRef.findMany({
    where: { shop, customerGid: gid },
  });
  const orderIds = (p.orders_requested || []).map((id) => String(id));
  const cod =
    orderIds.length > 0
      ? await prisma.codToken.findMany({
          where: { shop, orderNumericId: { in: orderIds } },
        })
      : [];

  return Response.json({
    whatssms_app: {
      stored_customer_refs: refs.length,
      cod_confirmations_for_orders: cod.map((c) => ({
        orderGid: c.orderGid,
        resolvedAction: c.resolvedAction,
      })),
    },
  });
};
