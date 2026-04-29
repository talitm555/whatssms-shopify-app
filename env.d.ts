/// <reference types="vite/client" />
/// <reference types="@remix-run/node" />

declare module "./scripts/remix-align-csrf-host.mjs" {
  import type { IncomingMessage } from "node:http";
  export function alignForwardedHostForRemixCsrf(
    req: IncomingMessage,
    shopifyAppUrl: string | undefined,
    extraOriginsRaw: string | undefined,
  ): void;
}
