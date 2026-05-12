import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "@remix-run/react";
import {
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  FormLayout,
  Page,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useEffect, useState } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { decryptSecret } from "../lib/crypto.server";
import {
  deviceSelectOptions,
  gatewayPartnerSelectOptions,
  readWhatssmsEnvelope,
  waAccountSelectOptions,
} from "../lib/whatssms-response.server";
import { defaultWhatssmsBaseUrl, WhatssmsClient } from "../lib/whatssms.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const row = await prisma.shopSettings.findUnique({ where: { shop } });

  let deviceOptions: { label: string; value: string }[] = [];
  let creditsSmsOptions: { label: string; value: string }[] = [];
  let waOptions: { label: string; value: string }[] = [];
  let apiError: string | null = null;
  let creditsRatesError: string | null = null;

  if (row?.encryptedWhatssmsSecret) {
    const secret = decryptSecret(row.encryptedWhatssmsSecret);
    const base = row.whatssmsApiBaseUrl || defaultWhatssmsBaseUrl();
    const client = new WhatssmsClient(base, secret);
    try {
      const [devicesJson, waJson] = await Promise.all([client.getDevices(), client.getWaAccounts()]);
      deviceOptions = deviceSelectOptions(devicesJson);
      waOptions = waAccountSelectOptions(waJson);
    } catch (e) {
      apiError = e instanceof Error ? e.message : String(e);
    }
    try {
      const ratesJson = await client.getRates();
      creditsSmsOptions = gatewayPartnerSelectOptions(ratesJson);
      const ratesEnv = readWhatssmsEnvelope(ratesJson);
      if (!ratesEnv.ok) {
        creditsRatesError = ratesEnv.message || `Error ${ratesEnv.status}`;
      }
    } catch (e) {
      creditsRatesError = e instanceof Error ? e.message : String(e);
    }
  }

  return {
    shop,
    hasSecret: Boolean(row?.encryptedWhatssmsSecret),
    defaultSmsMode: row?.defaultSmsMode || "devices",
    defaultSmsDeviceId: row?.defaultSmsDeviceId || "",
    defaultWaAccountId: row?.defaultWaAccountId || "",
    marketingRequiresSmsConsent: row?.marketingRequiresSmsConsent ?? true,
    urlShortenerSms: row?.urlShortenerSms ?? false,
    urlShortenerWhatsapp: row?.urlShortenerWhatsapp ?? false,
    deviceOptions,
    creditsSmsOptions,
    waOptions,
    apiError,
    creditsRatesError,
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
  const defaultSmsMode = String(form.get("defaultSmsMode") || "devices");
  const defaultSmsDeviceId = String(form.get("defaultSmsDeviceId") || "").trim();
  const defaultWaAccountId = String(form.get("defaultWaAccountId") || "").trim();
  const marketingRequiresSmsConsent = form.get("marketingRequiresSmsConsent") === "on";
  const urlShortenerSms = form.get("urlShortenerSms") === "on";
  const urlShortenerWhatsapp = form.get("urlShortenerWhatsapp") === "on";

  await prisma.shopSettings.update({
    where: { shop },
    data: {
      defaultSmsMode,
      defaultSmsDeviceId: defaultSmsDeviceId || null,
      defaultWaAccountId: defaultWaAccountId || null,
      marketingRequiresSmsConsent,
      urlShortenerSms,
      urlShortenerWhatsapp,
    },
  });

  return { ok: true as const };
};

export default function SendersPage() {
  const d = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  const [smsMode, setSmsMode] = useState(d.defaultSmsMode);
  const [smsDevice, setSmsDevice] = useState(d.defaultSmsDeviceId);
  const [waAccount, setWaAccount] = useState(d.defaultWaAccountId);
  const [marketing, setMarketing] = useState(d.marketingRequiresSmsConsent);
  const [urlShortenerSms, setUrlShortenerSms] = useState(d.urlShortenerSms);
  const [urlShortenerWhatsapp, setUrlShortenerWhatsapp] = useState(d.urlShortenerWhatsapp);

  useEffect(() => {
    setSmsMode(d.defaultSmsMode);
    setSmsDevice(d.defaultSmsDeviceId);
    setWaAccount(d.defaultWaAccountId);
    setMarketing(d.marketingRequiresSmsConsent);
    setUrlShortenerSms(d.urlShortenerSms);
    setUrlShortenerWhatsapp(d.urlShortenerWhatsapp);
  }, [d]);

  const smsDeviceOptions =
    d.deviceOptions.length > 0
      ? [{ label: "— Custom ID —", value: "__custom__" }, ...d.deviceOptions]
      : [{ label: "Enter device ID manually", value: "__custom__" }];

  const smsCreditsOptions =
    d.creditsSmsOptions.length > 0
      ? [{ label: "— Custom ID —", value: "__custom__" }, ...d.creditsSmsOptions]
      : [{ label: "Enter gateway or partner ID manually", value: "__custom__" }];

  const smsSenderOptions = smsMode === "credits" ? smsCreditsOptions : smsDeviceOptions;
  const smsSenderOptionValues = smsMode === "credits" ? d.creditsSmsOptions : d.deviceOptions;

  const waOptions =
    d.waOptions.length > 0
      ? [{ label: "— Custom ID —", value: "__custom__" }, ...d.waOptions]
      : [{ label: "Enter WhatsApp account ID manually", value: "__custom__" }];

  const smsSelectValue = smsSenderOptionValues.some((o) => o.value === smsDevice)
    ? smsDevice
    : "__custom__";
  const waSelectValue = d.waOptions.some((o) => o.value === waAccount) ? waAccount : "__custom__";

  return (
    <Page>
      <TitleBar title="Default Senders" />
      <BlockStack gap="400">
        {!d.hasSecret && (
          <Banner tone="warning" title="API key required">
            Configure your WhatsSMS API key on the Connection page to load devices and WhatsApp accounts.
          </Banner>
        )}
        {d.apiError && (
          <Banner tone="critical" title="WhatsSMS API">
            {d.apiError}
          </Banner>
        )}
        {d.creditsRatesError && (
          <Banner tone="warning" title="Gateway / partner list">
            Could not load gateways and partners ({d.creditsRatesError}). Your API key needs the get_rates
            permission for the dropdown to populate; you can still type a gateway id or partner device id
            manually.
          </Banner>
        )}
        {actionData && "error" in actionData && actionData.error && (
          <Banner tone="critical">{actionData.error}</Banner>
        )}
        {actionData?.ok && <Banner tone="success">Senders settings saved.</Banner>}

        <Form method="post">
          <BlockStack gap="400">
          <input type="hidden" name="defaultSmsMode" value={smsMode} />
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Default Sending Channels
              </Text>
              <FormLayout>
                <Select
                  label="SMS Mode"
                  options={[
                    { label: "Android Devices", value: "devices" },
                    { label: "Credits / Gateway", value: "credits" },
                  ]}
                  value={smsMode}
                  onChange={setSmsMode}
                />
                <Select
                  label="Default SMS Sender"
                  options={smsSenderOptions}
                  value={smsSelectValue}
                  onChange={(v) => {
                    if (v === "__custom__") setSmsDevice("");
                    else setSmsDevice(v);
                  }}
                  disabled={!d.hasSecret}
                  helpText={
                    smsMode === "credits"
                      ? "Gateways and Partner Devices from GET /api/get/rates (requires get_rates permission on your API Key)."
                      : "Paired Android Devices from your WhatsSMS account."
                  }
                />
                {smsSelectValue === "__custom__" ? (
                  <TextField
                    label={smsMode === "credits" ? "Gateway or partner ID" : "SMS device ID"}
                    name="defaultSmsDeviceId"
                    value={smsDevice}
                    onChange={setSmsDevice}
                    autoComplete="off"
                  />
                ) : (
                  <input type="hidden" name="defaultSmsDeviceId" value={smsDevice} />
                )}
                <Select
                  label="Default WhatsApp Account"
                  options={waOptions}
                  value={waSelectValue}
                  onChange={(v) => {
                    if (v === "__custom__") setWaAccount("");
                    else setWaAccount(v);
                  }}
                  disabled={!d.hasSecret}
                  helpText="Connected WhatsApp Accounts from your WhatsSMS account."
                />
                {waSelectValue === "__custom__" ? (
                  <TextField
                    label="WhatsApp Account ID"
                    name="defaultWaAccountId"
                    value={waAccount}
                    onChange={setWaAccount}
                    autoComplete="off"
                  />
                ) : (
                  <input type="hidden" name="defaultWaAccountId" value={waAccount} />
                )}
              </FormLayout>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                URL Shortener
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                When enabled, WhatsSMS will automatically shorten the links in outgoing messages.
              </Text>
              <label>
                <input
                  type="checkbox"
                  name="urlShortenerSms"
                  value="on"
                  checked={urlShortenerSms}
                  onChange={(e) => setUrlShortenerSms(e.currentTarget.checked)}
                />{" "}
                Enable for SMS Messages
              </label>
              <label>
                <input
                  type="checkbox"
                  name="urlShortenerWhatsapp"
                  value="on"
                  checked={urlShortenerWhatsapp}
                  onChange={(e) => setUrlShortenerWhatsapp(e.currentTarget.checked)}
                />{" "}
                Enable for WhatsApp Messages
              </label>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                Compliance
              </Text>
              <label>
                <input
                  type="checkbox"
                  name="marketingRequiresSmsConsent"
                  value="on"
                  checked={marketing}
                  onChange={(e) => setMarketing(e.currentTarget.checked)}
                />{" "}
                Require SMS marketing consent when Shopify includes it on the order payload
              </label>
            </BlockStack>
          </Card>

          <Box paddingBlockStart="200">
            <Button submit variant="primary" loading={busy} disabled={!d.hasSecret}>
              Save Senders
            </Button>
          </Box>
          </BlockStack>
        </Form>
      </BlockStack>
    </Page>
  );
}
