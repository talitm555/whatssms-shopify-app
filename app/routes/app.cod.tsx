import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Link, useActionData } from "@remix-run/react";
import {
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Collapsible,
  Form,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useCallback, useState } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { PLACEHOLDER_REFERENCE } from "../lib/placeholders";

const COD_SAMPLE_SMS = `Hi {{customer_name}}, please confirm your COD order {{order_name}}
({{line_items_count}} item(s), total {{total}} {{currency}}).
Confirm or reject: {{confirm_url_sms}}`;

const COD_SAMPLE_WA = `Hi {{customer_name}}, please confirm your COD order {{order_name}}
({{line_items_count}} item(s), total {{total}} {{currency}}).
Confirm or reject: {{confirm_url_wa}}`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const row = await prisma.shopSettings.findUnique({ where: { shop } });
  return {
    hasSecret: Boolean(row?.encryptedWhatssmsSecret),
    codEnabled: row?.codEnabled ?? true,
    codSendSms: row?.codSendSms ?? true,
    codSendWhatsapp: row?.codSendWhatsapp ?? false,
    codSmsTemplate: row?.codSmsTemplate ?? "",
    codWaTemplate: row?.codWaTemplate ?? "",
    codLinkTtlHours: row?.codLinkTtlHours ?? 72,
    codGatewayHints: row?.codGatewayHints ?? "",
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const existing = await prisma.shopSettings.findUnique({ where: { shop } });
  if (!existing?.encryptedWhatssmsSecret) {
    return { ok: false as const, error: "Save a WhatsSMS API key on the Connection page first." };
  }

  const form = await request.formData();
  const codEnabled = form.get("codEnabled") === "on";
  const codSendSms = form.get("codSendSms") === "on";
  const codSendWhatsapp = form.get("codSendWhatsapp") === "on";
  const codSmsTemplate = String(form.get("codSmsTemplate") || "");
  const codWaTemplate = String(form.get("codWaTemplate") || "");
  const codLinkTtlHours = Number(form.get("codLinkTtlHours") || 72);
  const codGatewayHints = String(form.get("codGatewayHints") || "").trim();

  await prisma.shopSettings.update({
    where: { shop },
    data: {
      codEnabled,
      codSendSms,
      codSendWhatsapp,
      codSmsTemplate,
      codWaTemplate,
      codLinkTtlHours: Number.isFinite(codLinkTtlHours) ? codLinkTtlHours : 72,
      codGatewayHints: codGatewayHints || null,
    },
  });

  return { ok: true as const };
};

export default function CodSettingsPage() {
  const d = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((o) => !o), []);

  const smsDefault =
    !d.codSmsTemplate ||
    d.codSmsTemplate ===
      "Order {{order_name}} ({{order_total}}). Confirm or reject: {{confirm_url_sms}}"
      ? COD_SAMPLE_SMS
      : d.codSmsTemplate;

  const waDefault =
    !d.codWaTemplate ||
    d.codWaTemplate ===
      "Order {{order_name}} ({{order_total}}). Confirm or reject: {{confirm_url_wa}}"
      ? COD_SAMPLE_WA
      : d.codWaTemplate;

  return (
    <Page>
      <TitleBar title="COD Confirmations" />
      <BlockStack gap="400">
        {actionData && "error" in actionData && actionData.error && (
          <Banner tone="critical">{actionData.error}</Banner>
        )}
        {actionData?.ok && <Banner tone="success">COD settings saved.</Banner>}
        {!d.hasSecret && (
          <Banner tone="warning">Connect WhatsSMS on the Connection page before configuring COD.</Banner>
        )}
        <Banner tone="info">
          <BlockStack gap="200">
            <Text as="p" variant="bodyMd">
              See all supported variables on the{" "}
              <Link to="/app/placeholders" style={{ textDecoration: "underline" }}>
                Placeholders
              </Link>{" "}
              page.
            </Text>
            <Button plain onClick={toggle} ariaExpanded={open} ariaControls="cod-placeholders-collapsible">
              {open ? "Hide" : "Show"} quick placeholder reference
            </Button>
            <Collapsible open={open} id="cod-placeholders-collapsible">
              <BlockStack gap="100">
                {PLACEHOLDER_REFERENCE.slice(0, 12).map((p) => (
                  <Text key={p.key} as="p" variant="bodySm" tone="subdued">
                    <code>{p.key}</code> — {p.description}
                  </Text>
                ))}
                <Text as="p" variant="bodySm" tone="subdued">
                  …and more on Placeholders.
                </Text>
              </BlockStack>
            </Collapsible>
          </BlockStack>
        </Banner>

        <Form method="post">
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                COD confirmation messages
              </Text>
              <label>
                <input type="checkbox" name="codEnabled" value="on" defaultChecked={d.codEnabled} /> Enable
                COD flow
              </label>
              <label>
                <input type="checkbox" name="codSendSms" value="on" defaultChecked={d.codSendSms} /> Send SMS
                link
              </label>
              <label>
                <input type="checkbox" name="codSendWhatsapp" value="on" defaultChecked={d.codSendWhatsapp} />{" "}
                Send WhatsApp link
              </label>
              <TextField
                label="SMS template"
                name="codSmsTemplate"
                defaultValue={smsDefault}
                multiline={5}
                autoComplete="off"
              />
              <TextField
                label="WhatsApp template"
                name="codWaTemplate"
                defaultValue={waDefault}
                multiline={5}
                autoComplete="off"
              />
              <TextField
                label="Link validity (hours)"
                name="codLinkTtlHours"
                defaultValue={String(d.codLinkTtlHours)}
                autoComplete="off"
              />
              <TextField
                label="Extra COD gateway hints"
                name="codGatewayHints"
                defaultValue={d.codGatewayHints || ""}
                autoComplete="off"
                helpText="Comma-separated substrings to match payment gateway names."
              />
            </BlockStack>
          </Card>
          <Box paddingBlockStart="400">
            <Button submit variant="primary" disabled={!d.hasSecret}>
              Save COD settings
            </Button>
          </Box>
        </Form>
      </BlockStack>
    </Page>
  );
}
