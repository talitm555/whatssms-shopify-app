import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import {
  BlockStack,
  Box,
  Button,
  Card,
  Page,
  Text,
  TextField,
  Banner,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const KEYS = [
  { key: "order_created", label: "Order created" },
  { key: "order_updated", label: "Order updated / fulfillment" },
  { key: "customer_created", label: "Customer created" },
  { key: "checkout_abandoned", label: "Abandoned checkout (checkouts/update)" },
  { key: "marketing_broadcast", label: "Marketing to opted-in customers" },
] as const;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const rows = await prisma.automation.findMany({ where: { shop } });
  const map = Object.fromEntries(rows.map((r) => [r.key, r]));
  return { shop, map };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();

  for (const { key } of KEYS) {
    const enabled = form.get(`${key}_enabled`) === "on";
    const sendSms = form.get(`${key}_sms`) === "on";
    const sendWa = form.get(`${key}_wa`) === "on";
    const template = String(form.get(`${key}_template`) || "");
    const smsMode = String(form.get(`${key}_smsMode`) || "devices");
    const smsDevice = String(form.get(`${key}_smsDevice`) || "").trim();
    const waAccount = String(form.get(`${key}_waAccount`) || "").trim();

    await prisma.automation.upsert({
      where: { shop_key: { shop, key } },
      create: {
        shop,
        key,
        enabled,
        sendSms,
        sendWa,
        template,
        smsMode,
        smsDevice: smsDevice || null,
        waAccount: waAccount || null,
      },
      update: {
        enabled,
        sendSms,
        sendWa,
        template,
        smsMode,
        smsDevice: smsDevice || null,
        waAccount: waAccount || null,
      },
    });
  }

  return { ok: true as const };
};

export default function AutomationsPage() {
  const { map } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  return (
    <Page>
      <TitleBar title="Automations" />
      <BlockStack gap="400">
        <Banner tone="info">
          <p>
            Use variables like {"{{order_name}}"}, {"{{order_total}}"}, {"{{customer_name}}"},{" "}
            {"{{confirm_url_sms}}"} in templates. Ensure recipients have opted in where required by
            law and Shopify policies.
          </p>
        </Banner>
        {actionData?.ok && <Banner tone="success">Saved.</Banner>}
        <Form method="post">
          {KEYS.map(({ key, label }) => {
            const row = map[key];
            return (
              <Card key={key}>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    {label}
                  </Text>
                  <label>
                    <input type="checkbox" name={`${key}_enabled`} value="on" defaultChecked={row?.enabled} />{" "}
                    Enabled
                  </label>
                  <label>
                    <input type="checkbox" name={`${key}_sms`} value="on" defaultChecked={row?.sendSms} />{" "}
                    SMS
                  </label>
                  <label>
                    <input type="checkbox" name={`${key}_wa`} value="on" defaultChecked={row?.sendWa} />{" "}
                    WhatsApp
                  </label>
                  <TextField
                    label="Template"
                    name={`${key}_template`}
                    defaultValue={row?.template || ""}
                    multiline={3}
                    autoComplete="off"
                  />
                  <TextField
                    label="SMS mode override (devices|credits)"
                    name={`${key}_smsMode`}
                    defaultValue={row?.smsMode || "devices"}
                    autoComplete="off"
                  />
                  <TextField
                    label="SMS device ID override"
                    name={`${key}_smsDevice`}
                    defaultValue={row?.smsDevice || ""}
                    autoComplete="off"
                  />
                  <TextField
                    label="WhatsApp account ID override"
                    name={`${key}_waAccount`}
                    defaultValue={row?.waAccount || ""}
                    autoComplete="off"
                  />
                </BlockStack>
              </Card>
            );
          })}
          <Box paddingBlockEnd="400">
            <Button submit variant="primary" loading={busy}>
              Save automations
            </Button>
          </Box>
        </Form>
      </BlockStack>
    </Page>
  );
}
