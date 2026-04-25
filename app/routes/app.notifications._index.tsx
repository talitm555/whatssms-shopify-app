import type { LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData, useNavigate } from "@remix-run/react";
import {
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  EmptyState,
  IndexTable,
  InlineStack,
  Page,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { NOTIFICATION_EVENT_OPTIONS } from "../lib/notification-events";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const rows = await prisma.automation.findMany({
    where: { shop },
    orderBy: { key: "asc" },
  });
  const labelByKey = Object.fromEntries(
    NOTIFICATION_EVENT_OPTIONS.map((e) => [e.key, e.label]),
  ) as Record<string, string>;
  return { shop, rows, labelByKey };
};

function channelsLabel(sendSms: boolean, sendWa: boolean): string {
  const parts: string[] = [];
  if (sendSms) parts.push("SMS");
  if (sendWa) parts.push("WhatsApp");
  return parts.length ? parts.join(" + ") : "—";
}

export default function NotificationsIndexPage() {
  const { rows, labelByKey } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const max = NOTIFICATION_EVENT_OPTIONS.length;
  const canAdd = rows.length < max;

  return (
    <Page>
      <TitleBar title="Customer Notifications">
        {canAdd ? (
          <button
            type="button"
            variant="primary"
            onClick={() => navigate("/app/notifications/new")}
          >
            New Notification
          </button>
        ) : null}
      </TitleBar>
      <BlockStack gap="400">
        <Banner tone="info">
          <p>
            Create one automation per Shopify event.
          </p>
        </Banner>

        {rows.length === 0 ? (
          <Card>
            <EmptyState
              heading="No notifications yet"
              action={
                canAdd
                  ? {
                      content: "New Notification",
                      onAction: () => navigate("/app/notifications/new"),
                    }
                  : undefined
              }
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>Send SMS or WhatsApp when orders, fulfillments, or customers change.</p>
            </EmptyState>
          </Card>
        ) : (
          <Card padding="0">
            <IndexTable
              resourceName={{ singular: "notification", plural: "notifications" }}
              itemCount={rows.length}
              headings={[
                { title: "Event" },
                { title: "Channels" },
                { title: "Enabled" },
                { title: "Template" },
                { title: "Actions" },
              ]}
              selectable={false}
            >
              {rows.map((row, index) => (
                <IndexTable.Row id={row.id} key={row.id} position={index}>
                  <IndexTable.Cell>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      {labelByKey[row.key] || row.key}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {row.key}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    {channelsLabel(row.sendSms, row.sendWa)}
                  </IndexTable.Cell>
                  <IndexTable.Cell>{row.enabled ? "Yes" : "No"}</IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="p" variant="bodySm" truncate>
                      {row.template.slice(0, 120)}
                      {row.template.length > 120 ? "…" : ""}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <InlineStack gap="200">
                      <Button url={`/app/notifications/${row.id}`}>Edit</Button>
                    </InlineStack>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          </Card>
        )}

        {!canAdd && rows.length > 0 && (
          <Box paddingBlockStart="200">
            <Text as="p" variant="bodySm" tone="subdued">
              All {max} event types are configured. Delete one to add another.
            </Text>
          </Box>
        )}

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">
              Reference
            </Text>
            <Text as="p" variant="bodyMd">
              Template variables: see{" "}
              <Link to="/app/placeholders" style={{ textDecoration: "underline" }}>
                Placeholders
              </Link>
              .
            </Text>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
