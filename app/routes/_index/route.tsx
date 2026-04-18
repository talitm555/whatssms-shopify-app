import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import {
  AppProvider,
  BlockStack,
  Button,
  Card,
  FormLayout,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import polarisTranslations from "@shopify/polaris/locales/en.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { useState } from "react";

import { login } from "../../shopify.server";

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

  return { showForm: Boolean(login) };
};

export default function IndexLanding() {
  const { showForm } = useLoaderData<typeof loader>();
  const [shop, setShop] = useState("");

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
                  Connect your store to send SMS and WhatsApp via WhatsSMS. Open
                  the app from the Shopify admin after install, or sign in with
                  your shop domain below.
                </Text>
              </BlockStack>
              {showForm && (
                <Form method="post" action="/auth/login">
                  <FormLayout>
                    <TextField
                      type="text"
                      name="shop"
                      label="Shop domain"
                      helpText="e.g. your-store.myshopify.com"
                      value={shop}
                      onChange={setShop}
                      autoComplete="on"
                    />
                    <Button submit variant="primary">
                      Log in
                    </Button>
                  </FormLayout>
                </Form>
              )}
            </BlockStack>
          </Card>
        </BlockStack>
      </Page>
    </AppProvider>
  );
}
