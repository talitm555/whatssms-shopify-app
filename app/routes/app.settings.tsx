import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit,
} from "@remix-run/react";
import {
  BlockStack,
  Box,
  Button,
  Card,
  FormLayout,
  InlineStack,
  Page,
  Select,
  Text,
  TextField,
  Banner,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
const DEFAULT_WHATSSMS_BASE = "https://app.whatssms.io";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const row = await prisma.shopSettings.findUnique({ where: { shop } });
  return {
    shop,
    defaultApiBase:
      process.env.WHATSSMS_API_BASE_URL?.trim() || DEFAULT_WHATSSMS_BASE,
    settings: row
      ? {
          hasSecret: Boolean(row.encryptedWhatssmsSecret),
          whatssmsApiBaseUrl: row.whatssmsApiBaseUrl || "",
          defaultSmsMode: row.defaultSmsMode,
          defaultSmsDeviceId: row.defaultSmsDeviceId || "",
          defaultWaAccountId: row.defaultWaAccountId || "",
          codEnabled: row.codEnabled,
          codSendSms: row.codSendSms,
          codSendWhatsapp: row.codSendWhatsapp,
          codSmsTemplate: row.codSmsTemplate,
          codWaTemplate: row.codWaTemplate,
          codLinkTtlHours: row.codLinkTtlHours,
          codGatewayHints: row.codGatewayHints || "",
          marketingRequiresSmsConsent: row.marketingRequiresSmsConsent,
        }
      : null,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = String(form.get("intent") || "save");

  if (intent === "test") {
    const secret = String(form.get("apiSecret") || "");
    const base =
      String(form.get("whatssmsApiBaseUrl") || "").trim() ||
      process.env.WHATSSMS_API_BASE_URL?.trim() ||
      DEFAULT_WHATSSMS_BASE;
    if (!secret) {
      return { ok: false as const, error: "API secret required for test" };
    }
    try {
      const { WhatssmsClient } = await import("../lib/whatssms.server");
      const client = new WhatssmsClient(base, secret);
      const credits = await client.getCredits();
      const devices = await client.getDevices();
      const wa = await client.getWaAccounts();
      return { ok: true as const, credits, devices, wa };
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  const apiSecret = String(form.get("apiSecret") || "").trim();
  const whatssmsApiBaseUrl = String(form.get("whatssmsApiBaseUrl") || "").trim();
  const defaultSmsMode = String(form.get("defaultSmsMode") || "devices");
  const defaultSmsDeviceId = String(form.get("defaultSmsDeviceId") || "").trim();
  const defaultWaAccountId = String(form.get("defaultWaAccountId") || "").trim();
  const codEnabled = form.get("codEnabled") === "on";
  const codSendSms = form.get("codSendSms") === "on";
  const codSendWhatsapp = form.get("codSendWhatsapp") === "on";
  const codSmsTemplate = String(form.get("codSmsTemplate") || "");
  const codWaTemplate = String(form.get("codWaTemplate") || "");
  const codLinkTtlHours = Number(form.get("codLinkTtlHours") || 72);
  const codGatewayHints = String(form.get("codGatewayHints") || "").trim();
  const marketingRequiresSmsConsent = form.get("marketingRequiresSmsConsent") === "on";

  const existing = await prisma.shopSettings.findUnique({ where: { shop } });
  let encrypted = existing?.encryptedWhatssmsSecret;
  if (apiSecret) {
    const { encryptSecret } = await import("../lib/crypto.server");
    encrypted = encryptSecret(apiSecret);
  }
  if (!encrypted) {
    return { ok: false as const, error: "Provide an API secret to save settings." };
  }

  await prisma.shopSettings.upsert({
    where: { shop },
    create: {
      shop,
      encryptedWhatssmsSecret: encrypted,
      whatssmsApiBaseUrl: whatssmsApiBaseUrl || null,
      defaultSmsMode,
      defaultSmsDeviceId: defaultSmsDeviceId || null,
      defaultWaAccountId: defaultWaAccountId || null,
      codEnabled,
      codSendSms,
      codSendWhatsapp,
      codSmsTemplate,
      codWaTemplate,
      codLinkTtlHours: Number.isFinite(codLinkTtlHours) ? codLinkTtlHours : 72,
      codGatewayHints: codGatewayHints || null,
      marketingRequiresSmsConsent,
    },
    update: {
      encryptedWhatssmsSecret: encrypted,
      whatssmsApiBaseUrl: whatssmsApiBaseUrl || null,
      defaultSmsMode,
      defaultSmsDeviceId: defaultSmsDeviceId || null,
      defaultWaAccountId: defaultWaAccountId || null,
      codEnabled,
      codSendSms,
      codSendWhatsapp,
      codSmsTemplate,
      codWaTemplate,
      codLinkTtlHours: Number.isFinite(codLinkTtlHours) ? codLinkTtlHours : 72,
      codGatewayHints: codGatewayHints || null,
      marketingRequiresSmsConsent,
    },
  });

  return { ok: true as const };
};

export default function SettingsPage() {
  const { settings, defaultApiBase } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const submit = useSubmit();
  const busy = nav.state !== "idle";

  const d = settings || {
    hasSecret: false,
    whatssmsApiBaseUrl: "",
    defaultSmsMode: "devices",
    defaultSmsDeviceId: "",
    defaultWaAccountId: "",
    codEnabled: true,
    codSendSms: true,
    codSendWhatsapp: false,
    codSmsTemplate: "",
    codWaTemplate: "",
    codLinkTtlHours: 72,
    codGatewayHints: "",
    marketingRequiresSmsConsent: true,
  };

  return (
    <Page>
      <TitleBar title="WhatsSMS connection" />
      <BlockStack gap="400">
        <Banner tone="info">
          <p>
            API keys are created in WhatsSMS under Tools → API Keys. Secrets are encrypted at rest
            (APP_ENCRYPTION_SECRET or SHOPIFY_API_SECRET).
          </p>
        </Banner>
        {actionData && "error" in actionData && actionData.error && (
          <Banner tone="critical" title="Error">
            {actionData.error}
          </Banner>
        )}
        {actionData && "ok" in actionData && actionData.ok === true && "credits" in actionData && (
          <Banner tone="success" title="Connection OK">
            <pre style={{ overflow: "auto", fontSize: 12 }}>
              {JSON.stringify(
                { credits: actionData.credits, devices: actionData.devices, wa: actionData.wa },
                null,
                2,
              )}
            </pre>
          </Banner>
        )}
        {actionData && "ok" in actionData && actionData.ok === true && !("credits" in actionData) && (
          <Banner tone="success">Settings saved.</Banner>
        )}

        <Form method="post" id="settings-form">
          <input type="hidden" name="intent" value="save" />
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Credentials
                </Text>
                <FormLayout>
                  <TextField
                    label="WhatsSMS API secret"
                    name="apiSecret"
                    type="password"
                    autoComplete="off"
                    helpText={
                      d.hasSecret ? "Leave blank to keep the existing secret." : "Required on first save."
                    }
                  />
                  <TextField
                    label="API base URL (optional)"
                    name="whatssmsApiBaseUrl"
                    defaultValue={d.whatssmsApiBaseUrl}
                    autoComplete="off"
                    placeholder={defaultApiBase}
                  />
                </FormLayout>
                <InlineStack gap="200">
                  <Button
                    disabled={busy}
                    onClick={(e) => {
                      e.preventDefault();
                      const el = document.getElementById("settings-form") as HTMLFormElement | null;
                      if (!el) return;
                      const fd = new FormData(el);
                      fd.delete("intent");
                      fd.set("intent", "test");
                      submit(fd, { method: "post" });
                    }}
                  >
                    Test connection
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Defaults
                </Text>
                <FormLayout>
                  <Select
                    label="SMS mode"
                    name="defaultSmsMode"
                    options={[
                      { label: "Android devices", value: "devices" },
                      { label: "Credits / gateway", value: "credits" },
                    ]}
                    defaultValue={d.defaultSmsMode}
                  />
                  <TextField
                    label="Default SMS device ID"
                    name="defaultSmsDeviceId"
                    defaultValue={d.defaultSmsDeviceId}
                    autoComplete="off"
                  />
                  <TextField
                    label="Default WhatsApp account ID"
                    name="defaultWaAccountId"
                    defaultValue={d.defaultWaAccountId}
                    autoComplete="off"
                  />
                </FormLayout>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  COD confirmation
                </Text>
                <label style={{ display: "block" }}>
                  <input type="checkbox" name="codEnabled" value="on" defaultChecked={d.codEnabled} />{" "}
                  Enable COD flow
                </label>
                <label style={{ display: "block" }}>
                  <input type="checkbox" name="codSendSms" value="on" defaultChecked={d.codSendSms} />{" "}
                  Send SMS link
                </label>
                <label style={{ display: "block" }}>
                  <input
                    type="checkbox"
                    name="codSendWhatsapp"
                    value="on"
                    defaultChecked={d.codSendWhatsapp}
                  />{" "}
                  Send WhatsApp link
                </label>
                <TextField
                  label="SMS template"
                  name="codSmsTemplate"
                  defaultValue={d.codSmsTemplate}
                  multiline={4}
                  autoComplete="off"
                />
                <TextField
                  label="WhatsApp template"
                  name="codWaTemplate"
                  defaultValue={d.codWaTemplate}
                  multiline={4}
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
                  defaultValue={d.codGatewayHints}
                  autoComplete="off"
                  helpText="Comma-separated substrings to match payment gateway names."
                />
              </BlockStack>
            </Card>

            <Card>
              <label style={{ display: "block" }}>
                <input
                  type="checkbox"
                  name="marketingRequiresSmsConsent"
                  value="on"
                  defaultChecked={d.marketingRequiresSmsConsent}
                />{" "}
                Require SMS marketing consent when Shopify includes it on the payload
              </label>
            </Card>

            <Box paddingBlockEnd="400">
              <Button submit variant="primary" loading={busy}>
                Save settings
              </Button>
            </Box>
          </BlockStack>
        </Form>
      </BlockStack>
    </Page>
  );
}
