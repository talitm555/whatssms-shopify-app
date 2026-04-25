import type { LoaderFunctionArgs } from "@remix-run/node";
import {
  BlockStack,
  Card,
  Layout,
  Link,
  List,
  Page,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function AboutPage() {
  return (
    <Page>
      <TitleBar title="About" />
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                WhatsSMS.io
              </Text>
              <Text as="p" variant="bodyMd">
                WhatsSMS.io helps merchants send SMS and WhatsApp messages using Android devices, gateway
                credits, and WhatsApp Business accounts — all from one dashboard.
              </Text>
              <Text as="p" variant="bodyMd">
                Learn more on{" "}
                <Link url="https://whatssms.io" target="_blank" removeUnderline>
                  whatssms.io
                </Link>
                .
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Contact &amp; support
              </Text>
              <List>
                <List.Item>
                  <Link url="https://whatssms.io" target="_blank" removeUnderline>
                    whatssms.io
                  </Link>
                </List.Item>
                <List.Item>
                  <Link url="mailto:support@whatssms.io" target="_blank" removeUnderline>
                    support@whatssms.io
                  </Link>
                </List.Item>
              </List>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Legal
              </Text>
              <List>
                <List.Item>
                  <Link url="https://whatssms.io/terms" target="_blank" removeUnderline>
                    Terms &amp; conditions
                  </Link>
                </List.Item>
                <List.Item>
                  <Link url="https://whatssms.io/privacy" target="_blank" removeUnderline>
                    Privacy policy
                  </Link>
                </List.Item>
                <List.Item>
                  <Link url="https://whatssms.io/refund" target="_blank" removeUnderline>
                    Refund policy
                  </Link>
                </List.Item>
              </List>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
