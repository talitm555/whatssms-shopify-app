import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  AppProvider,
  BlockStack,
  Button,
  Card,
  InlineStack,
  Page,
  Text,
} from "@shopify/polaris";
import polarisTranslations from "@shopify/polaris/locales/en.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const isEmbedded = url.searchParams.get("embedded") === "1";
  const shop = url.searchParams.get("shop");

  // Embedded admin loads the app URL with `embedded=1` + `shop` + session params on `/`.
  // App Bridge navigation expects a real app route (e.g. `/app`), not `/`, or you can see
  // client-side "Invalid path /" in the iframe.
  if (isEmbedded || shop) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return {
    appStoreListingUrl: process.env.SHOPIFY_APP_STORE_LISTING_URL || "https://apps.shopify.com/whatssms-io",
  };
};

export default function IndexLanding() {
  const { appStoreListingUrl } = useLoaderData<typeof loader>();

  return (
    <AppProvider i18n={polarisTranslations}>
      <Page title="WhatsSMS.io">
        <BlockStack gap="400">
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="200">
                <Text variant="headingLg" as="h1">
                  WhatsSMS.io for Shopify
                </Text>
                <Text as="p" tone="subdued">
                  WhatsSMS.io connects Shopify to SMS and WhatsApp messaging via
                  the WhatsSMS platform.
                </Text>
              </BlockStack>
              <InlineStack gap="300">
                <Button variant="primary" url={appStoreListingUrl}>
                  Install on Shopify
                </Button>
                <Button url="https://whatssms.io">Learn about WhatsSMS.io</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </BlockStack>
      </Page>
    </AppProvider>
  );
}
