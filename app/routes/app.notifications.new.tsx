import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import {
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Page,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useCallback, useState } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  defaultTemplateForEvent,
  NOTIFICATION_EVENT_OPTIONS,
  type NotificationEventKey,
} from "../lib/notification-events";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const rows = await prisma.automation.findMany({ where: { shop }, select: { key: true } });
  const used = new Set(rows.map((r) => r.key));
  const available = NOTIFICATION_EVENT_OPTIONS.filter((e) => !used.has(e.key));
  if (available.length === 0) {
    return redirect("/app/notifications");
  }
  return { available };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const key = String(form.get("eventKey") || "");
  const sendSms = form.get("sendSms") === "on";
  const sendWa = form.get("sendWa") === "on";
  const template = String(form.get("template") || "");
  const enabled = form.get("enabled") === "on";

  if (!NOTIFICATION_EVENT_OPTIONS.some((e) => e.key === key)) {
    return { ok: false as const, error: "Invalid event type." };
  }
  if (!sendSms && !sendWa) {
    return { ok: false as const, error: "Select at least one channel (SMS or WhatsApp)." };
  }

  const existing = await prisma.automation.findUnique({
    where: { shop_key: { shop, key } },
  });
  if (existing) {
    return { ok: false as const, error: "A notification for this event already exists." };
  }

  await prisma.automation.create({
    data: {
      shop,
      key,
      enabled,
      sendSms,
      sendWa,
      template,
    },
  });

  return redirect("/app/notifications");
};

export default function NotificationsNewPage() {
  const { available } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  const first = available[0]?.key as NotificationEventKey;
  const [eventKey, setEventKey] = useState<string>(first);
  const [template, setTemplate] = useState(() => defaultTemplateForEvent(first));
  const [sendSms, setSendSms] = useState(true);
  const [sendWa, setSendWa] = useState(false);
  const [enabled, setEnabled] = useState(true);

  const onEventChange = useCallback((v: string) => {
    setEventKey(v);
    setTemplate(defaultTemplateForEvent(v));
  }, []);

  return (
    <Page backAction={{ url: "/app/notifications" }}>
      <TitleBar title="New notification" />
      <BlockStack gap="400">
        {actionData && "error" in actionData && actionData.error && (
          <Banner tone="critical">{actionData.error}</Banner>
        )}
        <Form method="post">
          <input type="hidden" name="eventKey" value={eventKey} />
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Event
              </Text>
              <Select
                label="Event"
                options={available.map((e) => ({ label: e.label, value: e.key }))}
                value={eventKey}
                onChange={onEventChange}
              />
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Channels
              </Text>
              <label>
                <input
                  type="checkbox"
                  name="sendSms"
                  value="on"
                  checked={sendSms}
                  onChange={(e) => setSendSms(e.currentTarget.checked)}
                />{" "}
                SMS
              </label>
              <label>
                <input
                  type="checkbox"
                  name="sendWa"
                  value="on"
                  checked={sendWa}
                  onChange={(e) => setSendWa(e.currentTarget.checked)}
                />{" "}
                WhatsApp
              </label>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Template
              </Text>
              <TextField
                label="Message"
                name="template"
                value={template}
                onChange={setTemplate}
                multiline={6}
                autoComplete="off"
              />
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                Status
              </Text>
              <label>
                <input
                  type="checkbox"
                  name="enabled"
                  value="on"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.currentTarget.checked)}
                />{" "}
                Enabled
              </label>
            </BlockStack>
          </Card>
          <Box paddingBlockEnd="400">
            <Button submit variant="primary" loading={busy}>
              Save
            </Button>
          </Box>
        </Form>
      </BlockStack>
    </Page>
  );
}
