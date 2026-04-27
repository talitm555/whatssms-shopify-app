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
  Link,
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
import {
  formatUsageLimit,
  labelForUsageKey,
  sortUsageEntries,
} from "../lib/whatssms-usage-labels";
import {
  defaultWhatssmsBaseUrl,
  WhatssmsClient,
  whatssmsDashboardToolsKeysUrl,
} from "../lib/whatssms.server";

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

  let connection: {
    ok: boolean;
    message: string;
    creditsDisplay: { amount: number; currency: string } | null;
  } = {
    ok: false,
    message: "",
    creditsDisplay: null,
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
      let creditsDisplay: { amount: number; currency: string } | null = null;
      if (env.ok && env.data != null && typeof env.data === "object") {
        const data = env.data as Record<string, unknown>;
        const raw = data.credits;
        const amount = typeof raw === "number" ? raw : Number(raw);
        if (Number.isFinite(amount)) {
          creditsDisplay = {
            amount,
            currency: String(data.currency ?? "USD"),
          };
        }
      }
      connection = {
        ok: env.ok,
        message: env.ok ? "API connected successfully." : env.message || "API connection failed.",
        creditsDisplay,
      };
    } catch (e) {
      connection = {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
        creditsDisplay: null,
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
    hasSecret,
    connection,
    subscription,
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
  const { hasSecret, connection, subscription, whatssmsKeysUrl } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    if (actionData && "ok" in actionData && actionData.ok) setApiKey("");
  }, [actionData]);

  const usageEntries = subscription.usage
    ? (Object.entries(subscription.usage).filter(
        ([, v]) => v && typeof v === "object" && "used" in v && "limit" in v,
      ) as [string, { used?: number; limit?: number }][])
    : [];
  sortUsageEntries(usageEntries);

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
            ).
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

            {connection.ok && connection.creditsDisplay ? (
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Account Credits
                  </Text>
                  <Text as="p" variant="bodyMd">
                    Credits:{" "}
                    <strong>
                      {connection.creditsDisplay.amount} {connection.creditsDisplay.currency}
                    </strong>
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    These credits apply when you send SMS through the WhatsSMS gateway (credits mode),
                    not when messages are sent from your own paired Android device. Subscription quotas
                    and per-feature limits are shown in the section below.
                  </Text>
                </BlockStack>
              </Card>
            ) : null}

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Subscription &amp; Quota Details
                </Text>
                {!subscription.ok ? (
                  <Banner tone="warning">{subscription.message || "Could not load subscription."}</Banner>
                ) : (
                  <>
                    <Text as="p" variant="bodyMd">
                      Package: <strong>{subscription.packageName || "—"}</strong>
                    </Text>
                    <BlockStack gap="200">
                      {usageEntries.map(([key, v]) => {
                        const used = Number(v?.used ?? 0);
                        const limit = Number(v?.limit ?? 0);
                        const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
                        return (
                          <Box key={key} paddingBlockEnd="100">
                            <Text as="p" variant="bodySm">
                              {labelForUsageKey(key)} — {used} / {formatUsageLimit(limit)}
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
