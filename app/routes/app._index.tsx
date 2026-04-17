import type { LoaderFunctionArgs } from "@remix-run/node";
import { Link as RemixLink } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  BlockStack,
  InlineStack,
  List,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  return (
    <Page>
      <TitleBar title="WhatsSMS" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h1" variant="headingLg">
                  WhatsSMS.io for Shopify
                </Text>
                <Text as="p" variant="bodyMd">
                  Connect your WhatsSMS account, configure COD confirmation links, and automate SMS /
                  WhatsApp messaging using the WhatsSMS REST API (see your dashboard API docs).
                </Text>
                <InlineStack gap="300">
                  <RemixLink to="/app/settings">Connection &amp; COD settings</RemixLink>
                  <RemixLink to="/app/automations">Automations</RemixLink>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Built for Shopify checklist
                </Text>
                <List>
                  <List.Item>Embedded admin + Polaris + App Bridge</List.Item>
                  <List.Item>Offline sessions + GraphQL for order tags</List.Item>
                  <List.Item>GDPR / compliance webhooks</List.Item>
                  <List.Item>HMAC-verified Shopify webhooks + idempotency</List.Item>
                  <List.Item>Encrypted API secrets (server-only)</List.Item>
                </List>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
