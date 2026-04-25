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
  Box,
  Button,
  Card,
  InlineStack,
  Page,
  ProgressBar,
  Text,
  TextField,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useEffect, useState } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { readWhatssmsEnvelope } from "../lib/whatssms-response.server";
import { defaultWhatssmsBaseUrl, WhatssmsClient } from "../lib/whatssms.server";

function apiBase(): string {
  return defaultWhatssmsBaseUrl();
}

type SubscriptionUsage = Record<
  string,
  { used?: number; limit?: number } | undefined
>;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const row = await prisma.shopSettings.findUnique({ where: { shop } });
  const hasSecret = Boolean(row?.encryptedWhatssmsSecret);

  let connection: { ok: boolean; message: string; credits?: unknown } = {
    ok: false,
    message: "",
  };
  let subscription: {
    ok: boolean;
    message: string;
    packageName?: string;
    usage?: SubscriptionUsage;
  } = { ok: false, message: "" };

  if (hasSecret && row?.encryptedWhatssmsSecret) {
    const { decryptSecret } = await import("../lib/crypto.server");
    const secret = decryptSecret(row.encryptedWhatssmsSecret);
    const client = new WhatssmsClient(apiBase(), secret);
    try {
      const creditsJson = await client.getCredits();
      const env = readWhatssmsEnvelope(creditsJson);
      connection = {
        ok: env.ok,
        message: env.ok ? "API responded successfully." : env.message || "Unexpected API response.",
        credits: env.data,
      };
    } catch (e) {
      connection = {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      };
    }
    try {
      const subJson = await client.getSubscription();
      const env = readWhatssmsEnvelope<{ name?: string; usage?: SubscriptionUsage }>(subJson);
      subscription = {
        ok: env.ok,
        message: env.ok ? "" : env.message || "Subscription unavailable for this key.",
        packageName: env.data?.name,
        usage: env.data?.usage,
      };
    } catch (e) {
      subscription = {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      };
    }
  }

  return {
    shop,
    apiBaseDisplay: apiBase(),
    hasSecret,
    connection,
    subscription,
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
    const creditsJson = await client.getCredits();
    const env = readWhatssmsEnvelope(creditsJson);
    if (!env.ok) {
      return {
        ok: false as const,
        error: env.message || "API key validation failed.",
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
  const { hasSecret, connection, subscription, apiBaseDisplay } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    if (actionData && "ok" in actionData && actionData.ok) setApiKey("");
  }, [actionData]);

  const usageRows = subscription.usage
    ? Object.entries(subscription.usage).filter(
        ([, v]) => v && typeof v === "object" && "used" in v && "limit" in v,
      )
    : [];

  return (
    <Page>
      <TitleBar title="WhatsSMS.io Connection" />
      <BlockStack gap="400">
        <Banner tone="info">
          <p>
            Create API keys in WhatsSMS under <strong>Tools → API Keys</strong>. Keys are encrypted at
            rest. API host is fixed from environment: <code>{apiBaseDisplay}</code>
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
                    helpText="We validate this key against the WhatsSMS API before saving."
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
                    API connection
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
                {connection.credits != null && (
                  <Text as="p" variant="bodySm">
                    <code style={{ fontSize: 12 }}>{JSON.stringify(connection.credits)}</code>
                  </Text>
                )}
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Subscription &amp; quota
                </Text>
                {!subscription.ok ? (
                  <Banner tone="warning">{subscription.message || "Could not load subscription."}</Banner>
                ) : (
                  <>
                    <Text as="p" variant="bodyMd">
                      Package: <strong>{subscription.packageName || "—"}</strong>
                    </Text>
                    <BlockStack gap="200">
                      {usageRows.map(([key, v]) => {
                        const used = Number(v?.used ?? 0);
                        const limit = Number(v?.limit ?? 0);
                        const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
                        return (
                          <Box key={key} paddingBlockEnd="100">
                            <Text as="p" variant="bodySm">
                              {key.replace(/_/g, " ")} — {used} / {limit}
                            </Text>
                            {limit > 0 ? <ProgressBar progress={pct} size="small" /> : null}
                          </Box>
                        );
                      })}
                    </BlockStack>
                  </>
                )}
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Rotate API key
                </Text>
                <Form method="post">
                  <BlockStack gap="300">
                    <TextField
                      label="New WhatsSMS API key"
                      name="apiSecret"
                      type="password"
                      autoComplete="off"
                      value={apiKey}
                      onChange={setApiKey}
                    />
                    <Button submit variant="primary" loading={busy} disabled={!apiKey.trim()}>
                      Update key
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
