import type { LoaderFunctionArgs } from "@remix-run/node";
import { Link as RemixLink, useLoaderData } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Card,
  InlineStack,
  Layout,
  List,
  Page,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const row = await prisma.shopSettings.findUnique({
    where: { shop: session.shop },
    select: { encryptedWhatssmsSecret: true },
  });
  return { hasWhatssmsKey: Boolean(row?.encryptedWhatssmsSecret) };
};

export default function Index() {
  const { hasWhatssmsKey } = useLoaderData<typeof loader>();

  return (
    <Page>
      <TitleBar title="WhatsSMS" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h1" variant="headingLg">
                  WhatsSMS for Shopify
                </Text>
                <Text as="p" variant="bodyMd">
                  Connect your WhatsSMS account, configure Default Senders, COD Confirmations, and Customer Notifications.
                </Text>
                <InlineStack gap="300" blockAlign="center">
                  <Text as="span" variant="bodyMd">
                    API key:
                  </Text>
                  {hasWhatssmsKey ? (
                    <Badge tone="success">Configured</Badge>
                  ) : (
                    <Badge tone="attention">Not set</Badge>
                  )}
                </InlineStack>
                <InlineStack gap="300">
                  <RemixLink to="/app/connection">Connection</RemixLink>
                  <RemixLink to="/app/senders">Default Senders</RemixLink>
                  <RemixLink to="/app/cod">COD Confirmations</RemixLink>
                  <RemixLink to="/app/notifications">Customer Notifications</RemixLink>
                  <RemixLink to="/app/placeholders">Placeholders</RemixLink>
                  <RemixLink to="/app/about">About</RemixLink>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Quick start
                </Text>
                <List>
                  <List.Item>
                    <RemixLink to="/app/connection">Add your WhatsSMS API Key</RemixLink>
                  </List.Item>
                  <List.Item>
                    <RemixLink to="/app/senders">Choose Default SMS / WhatsApp Senders</RemixLink>
                  </List.Item>
                  <List.Item>
                    <RemixLink to="/app/cod">Tune COD Confirmation Templates</RemixLink>
                  </List.Item>
                  <List.Item>
                    <RemixLink to="/app/notifications">Add Customer Notifications</RemixLink>
                  </List.Item>
                </List>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
