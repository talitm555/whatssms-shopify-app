import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { addOrderTagsIfMissing } from "../lib/order-tags.server";
import { confirmationTagForChannel } from "../lib/cod-detection.server";

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const publicToken = params.token;
  if (!publicToken) throw new Response("Not found", { status: 404 });

  const row = await prisma.codToken.findUnique({ where: { publicToken } });
  if (!row) throw new Response("Not found", { status: 404 });
  if (row.expiresAt.getTime() < Date.now()) {
    return { status: "expired" as const, shop: row.shop };
  }

  const url = new URL(request.url);
  const channel = url.searchParams.get("c") === "whatsapp" ? "whatsapp" : "sms";

  if (row.resolvedAction) {
    return {
      status: "done" as const,
      action: row.resolvedAction as "confirm" | "reject",
      shop: row.shop,
      channel,
    };
  }

  return { status: "open" as const, shop: row.shop, channel };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const publicToken = params.token;
  if (!publicToken) throw new Response("Not found", { status: 404 });

  const form = await request.formData();
  const decision = form.get("decision");
  if (decision !== "confirm" && decision !== "reject") {
    throw new Response("Bad request", { status: 400 });
  }

  const ch = form.get("c");
  const channel = ch === "whatsapp" ? "whatsapp" : "sms";

  const row = await prisma.codToken.findUnique({ where: { publicToken } });
  if (!row) throw new Response("Not found", { status: 404 });
  if (row.expiresAt.getTime() < Date.now()) {
    throw new Response("Expired", { status: 410 });
  }

  const tag = confirmationTagForChannel(channel, decision);

  const updated = await prisma.codToken.updateMany({
    where: {
      publicToken,
      resolvedAction: null,
    },
    data: {
      resolvedAction: decision,
      resolvedAt: new Date(),
    },
  });

  if (updated.count === 0) {
    return new Response(null, { status: 303, headers: { Location: `/cod/${publicToken}?c=${channel}` } });
  }

  const { admin } = await unauthenticated.admin(row.shop);
  await addOrderTagsIfMissing(admin, row.orderGid, [tag]);

  return new Response(null, { status: 303, headers: { Location: `/cod/${publicToken}?c=${channel}` } });
};

export default function CodConfirmPage() {
  const data = useLoaderData<typeof loader>();

  if (data.status === "expired") {
    return (
      <div style={{ fontFamily: "system-ui", padding: 24 }}>
        <h1>Link expired</h1>
        <p>This confirmation link is no longer valid.</p>
      </div>
    );
  }

  if (data.status === "done") {
    return (
      <div style={{ fontFamily: "system-ui", padding: 24 }}>
        <h1>Thank you</h1>
        <p>Your response has been recorded.</p>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "system-ui", padding: 24, maxWidth: 480 }}>
      <h1>Confirm your order</h1>
      <p>Shop: {data.shop}</p>
      <Form method="post">
        <input type="hidden" name="c" value={data.channel} />
        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          <button
            type="submit"
            name="decision"
            value="confirm"
            style={{ padding: "12px 20px", fontSize: 16 }}
          >
            Confirm order
          </button>
          <button
            type="submit"
            name="decision"
            value="reject"
            style={{ padding: "12px 20px", fontSize: 16 }}
          >
            Reject order
          </button>
        </div>
      </Form>
    </div>
  );
}
