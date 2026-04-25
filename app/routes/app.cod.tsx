import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Link, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
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
import { useCallback, useEffect, useState } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { PLACEHOLDER_REFERENCE } from "../lib/placeholders";

const COD_SAMPLE_SMS = `Hi {{customer_name}}, please confirm your COD order {{order_name}}
({{line_items_count}} item(s), total {{total}} {{currency}}).
Confirm or reject: {{confirm_url_sms}}`;

const COD_SAMPLE_WA = `Hi {{customer_name}}, please confirm your COD order {{order_name}}
({{line_items_count}} item(s), total {{total}} {{currency}}).
Confirm or reject: {{confirm_url_wa}}`;

const DEFAULT_GATEWAY_HINTS = "Cash on Delivery, Bank Transfer";

const LEGACY_SMS =
  "Order {{order_name}} ({{order_total}}). Confirm or reject: {{confirm_url_sms}}";
const LEGACY_WA =
  "Order {{order_name}} ({{order_total}}). Confirm or reject: {{confirm_url_wa}}";

function effectiveCodSmsTemplate(raw: string): string {
  const t = raw.trim();
  if (!t || t === LEGACY_SMS) return COD_SAMPLE_SMS;
  return raw;
}

function effectiveCodWaTemplate(raw: string): string {
  const t = raw.trim();
  if (!t || t === LEGACY_WA) return COD_SAMPLE_WA;
  return raw;
}

function effectiveGatewayHints(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) return DEFAULT_GATEWAY_HINTS;
  return t;
}

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
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((o) => !o), []);

  const [codEnabled, setCodEnabled] = useState(d.codEnabled);
  const [codSendSms, setCodSendSms] = useState(d.codSendSms);
  const [codSendWhatsapp, setCodSendWhatsapp] = useState(d.codSendWhatsapp);
  const [codSmsTemplate, setCodSmsTemplate] = useState(() =>
    effectiveCodSmsTemplate(d.codSmsTemplate),
  );
  const [codWaTemplate, setCodWaTemplate] = useState(() =>
    effectiveCodWaTemplate(d.codWaTemplate),
  );
  const [codLinkTtlHours, setCodLinkTtlHours] = useState(String(d.codLinkTtlHours ?? 72));
  const [codGatewayHints, setCodGatewayHints] = useState(() =>
    effectiveGatewayHints(d.codGatewayHints),
  );

  useEffect(() => {
    setCodEnabled(d.codEnabled);
    setCodSendSms(d.codSendSms);
    setCodSendWhatsapp(d.codSendWhatsapp);
    setCodSmsTemplate(effectiveCodSmsTemplate(d.codSmsTemplate));
    setCodWaTemplate(effectiveCodWaTemplate(d.codWaTemplate));
    setCodLinkTtlHours(String(d.codLinkTtlHours ?? 72));
    setCodGatewayHints(effectiveGatewayHints(d.codGatewayHints));
  }, [d]);

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
                <input
                  type="checkbox"
                  name="codEnabled"
                  value="on"
                  checked={codEnabled}
                  onChange={(e) => setCodEnabled(e.currentTarget.checked)}
                />{" "}
                Enable COD flow
              </label>
              <label>
                <input
                  type="checkbox"
                  name="codSendSms"
                  value="on"
                  checked={codSendSms}
                  onChange={(e) => setCodSendSms(e.currentTarget.checked)}
                />{" "}
                Send SMS link
              </label>
              <label>
                <input
                  type="checkbox"
                  name="codSendWhatsapp"
                  value="on"
                  checked={codSendWhatsapp}
                  onChange={(e) => setCodSendWhatsapp(e.currentTarget.checked)}
                />{" "}
                Send WhatsApp link
              </label>
              <TextField
                label="SMS template"
                name="codSmsTemplate"
                value={codSmsTemplate}
                onChange={setCodSmsTemplate}
                multiline={5}
                autoComplete="off"
              />
              <TextField
                label="WhatsApp template"
                name="codWaTemplate"
                value={codWaTemplate}
                onChange={setCodWaTemplate}
                multiline={5}
                autoComplete="off"
              />
              <TextField
                label="Link validity (hours)"
                name="codLinkTtlHours"
                value={codLinkTtlHours}
                onChange={setCodLinkTtlHours}
                type="number"
                autoComplete="off"
                min={1}
              />
              <TextField
                label="Extra COD gateway hints"
                name="codGatewayHints"
                value={codGatewayHints}
                onChange={setCodGatewayHints}
                autoComplete="off"
                helpText="Comma-separated substrings to match payment gateway names."
              />
            </BlockStack>
          </Card>
          <Box paddingBlockStart="400">
            <Button submit variant="primary" loading={busy} disabled={!d.hasSecret}>
              Save COD Settings
            </Button>
          </Box>
        </Form>
      </BlockStack>
    </Page>
  );
}
