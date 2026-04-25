import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "@remix-run/react";
import {
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useEffect, useState } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { NOTIFICATION_EVENT_OPTIONS } from "../lib/notification-events";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const id = params.id;
  if (!id) throw new Response("Not found", { status: 404 });
  const row = await prisma.automation.findFirst({
    where: { id, shop },
  });
  if (!row) throw new Response("Not found", { status: 404 });
  const label =
    NOTIFICATION_EVENT_OPTIONS.find((e) => e.key === row.key)?.label || row.key;
  return { row, label };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const id = params.id;
  if (!id) throw new Response("Not found", { status: 404 });

  const form = await request.formData();
  const intent = String(form.get("intent") || "save");

  if (intent === "delete") {
    await prisma.automation.deleteMany({ where: { id, shop } });
    return redirect("/app/notifications");
  }

  const sendSms = form.get("sendSms") === "on";
  const sendWa = form.get("sendWa") === "on";
  const template = String(form.get("template") || "");
  const enabled = form.get("enabled") === "on";

  if (!sendSms && !sendWa) {
    return { ok: false as const, error: "Select at least one channel (SMS or WhatsApp)." };
  }

  await prisma.automation.updateMany({
    where: { id, shop },
    data: {
      enabled,
      sendSms,
      sendWa,
      template,
    },
  });

  return redirect("/app/notifications");
};

export default function NotificationsEditPage() {
  const { row, label } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  const [template, setTemplate] = useState(row.template);
  const [sendSms, setSendSms] = useState(row.sendSms);
  const [sendWa, setSendWa] = useState(row.sendWa);
  const [enabled, setEnabled] = useState(row.enabled);

  useEffect(() => {
    setTemplate(row.template);
    setSendSms(row.sendSms);
    setSendWa(row.sendWa);
    setEnabled(row.enabled);
  }, [row]);

  return (
    <Page backAction={{ url: "/app/notifications" }}>
      <TitleBar title={`Edit: ${label}`} />
      <BlockStack gap="400">
        {actionData && "error" in actionData && actionData.error && (
          <Banner tone="critical">{actionData.error}</Banner>
        )}
        <Card>
          <BlockStack gap="200">
            <Text as="p" variant="bodyMd">
              Event: <strong>{label}</strong>
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              {row.key}
            </Text>
          </BlockStack>
        </Card>
        <Form method="post">
          <input type="hidden" name="intent" value="save" />
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
          </Card>
          <Box paddingBlockEnd="400">
            <Button submit variant="primary" loading={busy}>
              Save
            </Button>
          </Box>
        </Form>
        <Form
          method="post"
          onSubmit={(e) => {
            if (!confirm("Delete this notification?")) e.preventDefault();
          }}
        >
          <input type="hidden" name="intent" value="delete" />
          <Button submit tone="critical" variant="secondary" loading={busy}>
            Delete notification
          </Button>
        </Form>
      </BlockStack>
    </Page>
  );
}
