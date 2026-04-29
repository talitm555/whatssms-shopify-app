import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  AppProvider as PolarisAppProvider,
  BlockStack,
  Button,
  Card,
  InlineStack,
  Page,
  Text,
} from "@shopify/polaris";
import polarisTranslations from "@shopify/polaris/locales/en.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { login } from "../../shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await login(request);

  return {
    appStoreListingUrl: process.env.SHOPIFY_APP_STORE_LISTING_URL || "https://apps.shopify.com/whatssms-io",
    polarisTranslations,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await login(request);

  return null;
};

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();

  return (
    <PolarisAppProvider i18n={loaderData.polarisTranslations}>
      <Page>
        <Card>
          <BlockStack gap="400">
            <BlockStack gap="200">
              <Text variant="headingMd" as="h2">
                Install WhatsSMS from Shopify
              </Text>
              <Text as="p" tone="subdued">
                Start installation from the Shopify App Store or open the app
                from your Shopify admin after it is installed.
              </Text>
            </BlockStack>
            <InlineStack gap="300">
              <Button variant="primary" url={loaderData.appStoreListingUrl}>
                Install on Shopify
              </Button>
              <Button url="https://whatssms.io">Learn about WhatsSMS</Button>
            </InlineStack>
          </BlockStack>
        </Card>
      </Page>
    </PolarisAppProvider>
  );
}
