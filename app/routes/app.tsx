import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Outlet, useLoaderData, useNavigate, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { useEffect } from "react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { authenticate } from "../shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

/**
 * App Bridge fires `shopify:navigate` so the host can sync the iframe. The
 * remix `AppProvider` passes `event.target.getAttribute("href")` to
 * `navigate()`. For same-origin links the resolved URL can be absolute
 * (`https://…/app?embedded=…`). Feeding that string to React Router breaks
 * `parsePath` (the `?` in `https://` is not the query delimiter), which
 * surfaces as an "Invalid path …" client error. Normalize with URL() first.
 */
function EmbeddedNavigateFix() {
  const navigate = useNavigate();

  useEffect(() => {
    const onNavigate = (event: Event) => {
      const detail = (event as CustomEvent<{ url?: string; path?: string }>)
        .detail;
      let raw: string | null = null;
      if (detail && typeof detail.url === "string") raw = detail.url;
      else if (detail && typeof detail.path === "string") raw = detail.path;
      else {
        const el = event.target as HTMLElement | null;
        raw = el?.getAttribute?.("href") ?? null;
      }
      if (!raw) return;

      try {
        const url = new URL(raw, window.location.origin);
        navigate(url.pathname + url.search + url.hash);
      } catch {
        navigate(raw);
      }
      event.stopImmediatePropagation();
    };

    window.addEventListener("shopify:navigate", onNavigate, true);
    return () => window.removeEventListener("shopify:navigate", onNavigate, true);
  }, [navigate]);

  return null;
}

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <EmbeddedNavigateFix />
      <NavMenu>
        <a href="/app" rel="home">
          Home
        </a>
        <a href="/app/settings">WhatsSMS settings</a>
        <a href="/app/automations">Automations</a>
        <a href="/app/additional">About</a>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
