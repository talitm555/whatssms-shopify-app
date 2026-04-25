import type { LoaderFunctionArgs } from "@remix-run/node";
import {
  BlockStack,
  Card,
  IndexTable,
  Page,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { PLACEHOLDER_REFERENCE } from "../lib/placeholders";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function PlaceholdersPage() {
  const rows = PLACEHOLDER_REFERENCE.map((p, i) => ({ ...p, id: String(i) }));

  return (
    <Page>
      <TitleBar title="Placeholders" />
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <Text as="p" variant="bodyMd">
              Use these variables in COD templates and customer notification templates. They are replaced
              when messages are sent (missing values become empty strings).
            </Text>
            <IndexTable
              resourceName={{ singular: "placeholder", plural: "placeholders" }}
              itemCount={rows.length}
              headings={[
                { title: "Placeholder" },
                { title: "Description" },
              ]}
              selectable={false}
            >
              {rows.map((row, index) => (
                <IndexTable.Row id={row.id} key={row.id} position={index}>
                  <IndexTable.Cell>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      <code>{row.key}</code>
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" variant="bodyMd">
                      {row.description}
                    </Text>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
