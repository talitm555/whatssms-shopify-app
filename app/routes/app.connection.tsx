import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "@remix-run/react";
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  InlineStack,
  Link,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useEffect, useState } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { readWhatssmsEnvelope } from "../lib/whatssms-response.server";
import {
  defaultWhatssmsBaseUrl,
  WhatssmsClient,
  whatssmsDashboardToolsKeysUrl,
} from "../lib/whatssms.server";

function apiBase(): string {
  return defaultWhatssmsBaseUrl();
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const row = await prisma.shopSettings.findUnique({ where: { shop } });
  const hasSecret = Boolean(row?.encryptedWhatssmsSecret);

  let connection: { ok: boolean; message: string } = {
    ok: false,
    message: "",
  };

  if (hasSecret && row?.encryptedWhatssmsSecret) {
    const { decryptSecret } = await import("../lib/crypto.server");
    const secret = decryptSecret(row.encryptedWhatssmsSecret);
    const client = new WhatssmsClient(apiBase(), secret);
    try {
      const json = await client.getShorteners();
      const env = readWhatssmsEnvelope(json);
      connection = {
        ok: env.ok,
        message: env.ok
          ? "API connected successfully."
          : env.message || "API connection failed.",
      };
    } catch (e) {
      connection = {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      };
    }
  }

  return {
    shop,
    hasSecret,
    connection,
    whatssmsKeysUrl: whatssmsDashboardToolsKeysUrl(),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const apiSecret = String(form.get("apiSecret") || "").trim();
  if (!apiSecret) {
    return { ok: false as const, error: "Enter your WhatsSMS API key." };
  }

  const client = new WhatssmsClient(apiBase(), apiSecret);
  try {
    const json = await client.getShorteners();
    const env = readWhatssmsEnvelope(json);
    if (!env.ok) {
      return {
        ok: false as const,
        error:
          env.message ||
          "API key validation failed. Ensure the key has the get_shorteners permission (Tools → API Keys).",
      };
    }
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const { encryptSecret } = await import("../lib/crypto.server");
  const encrypted = encryptSecret(apiSecret);

  await prisma.shopSettings.upsert({
    where: { shop },
    create: {
      shop,
      encryptedWhatssmsSecret: encrypted,
      whatssmsApiBaseUrl: null,
    },
    update: {
      encryptedWhatssmsSecret: encrypted,
      whatssmsApiBaseUrl: null,
    },
  });

  return { ok: true as const };
};

export default function ConnectionPage() {
  const { hasSecret, connection, whatssmsKeysUrl } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    if (actionData && "ok" in actionData && actionData.ok) setApiKey("");
  }, [actionData]);

  return (
    <Page>
      <TitleBar title="Connection" />
      <BlockStack gap="400">
        <Banner tone="info">
          <p>
            Create API Keys in WhatsSMS under <strong>Tools → API Keys</strong> (
            <Link url={whatssmsKeysUrl} target="_blank" removeUnderline>
              open dashboard
            </Link>
            ). Enable permission for <strong>get shorteners</strong> so the app can verify your key.
            This Shopify app is free; messaging costs are billed only on your WhatsSMS account if you use paid routes there.
          </p>
        </Banner>
        {actionData && "error" in actionData && actionData.error && (
          <Banner tone="critical" title="Error">
            {actionData.error}
          </Banner>
        )}
        {actionData && "ok" in actionData && actionData.ok && (
          <Banner tone="success">API key saved. Connection status refreshed.</Banner>
        )}

        {!hasSecret ? (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Connect WhatsSMS.io
              </Text>
              <Text as="p" variant="bodyMd">
                Enter your WhatsSMS API secret to enable messaging, COD confirmations, and customer
                notifications.
              </Text>
              <Form method="post">
                <BlockStack gap="300">
                  <TextField
                    label="WhatsSMS API key"
                    name="apiSecret"
                    type="password"
                    autoComplete="off"
                    value={apiKey}
                    onChange={setApiKey}
                    helpText="We validate your key with the WhatsSMS API (get shorteners) before saving. Nothing is shown except connected / error."
                  />
                  <Button submit variant="primary" loading={busy} disabled={!apiKey.trim()}>
                    Save and connect
                  </Button>
                </BlockStack>
              </Form>
            </BlockStack>
          </Card>
        ) : (
          <>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    API Connection Status
                  </Text>
                  {connection.ok ? (
                    <Badge tone="success">Connected</Badge>
                  ) : (
                    <Badge tone="critical">Disconnected</Badge>
                  )}
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  {connection.message}
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Rotate API Key
                </Text>
                <Form method="post">
                  <BlockStack gap="300">
                    <TextField
                      label="New WhatsSMS API Key"
                      name="apiSecret"
                      type="password"
                      autoComplete="off"
                      value={apiKey}
                      onChange={setApiKey}
                    />
                    <Button submit variant="primary" loading={busy} disabled={!apiKey.trim()}>
                      Update API Key
                    </Button>
                  </BlockStack>
                </Form>
              </BlockStack>
            </Card>
          </>
        )}
      </BlockStack>
    </Page>
  );
}
