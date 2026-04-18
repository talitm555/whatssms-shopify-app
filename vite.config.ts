import { vitePlugin as remix } from "@remix-run/dev";
import { installGlobals } from "@remix-run/node";
import { defineConfig, loadEnv, type UserConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

installGlobals({ nativeFetch: true });

/**
 * Dev: open the app only via your public URL (e.g. Cloudflare tunnel → `SHOPIFY_APP_URL`).
 * HMR uses `wss` to that host (HTTPS / 443). Vite listens on `PORT` (default 3150) for the tunnel to forward to.
 * Prod: `SHOPIFY_APP_URL` on the server matches `shopify.app.toml` (`https://shopify.whatssms.io`).
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  // Related: https://github.com/remix-run/remix/issues/2835#issuecomment-1144102176
  let shopifyAppUrl = env.SHOPIFY_APP_URL || process.env.SHOPIFY_APP_URL;
  const hostEnv = env.HOST || process.env.HOST;
  if (
    hostEnv &&
    (!shopifyAppUrl || shopifyAppUrl === hostEnv)
  ) {
    shopifyAppUrl = hostEnv;
    process.env.SHOPIFY_APP_URL = hostEnv;
    delete process.env.HOST;
  }
  const shopifyUrl = shopifyAppUrl || "http://localhost";
  const host = new URL(shopifyUrl).hostname;

  // Tunnel / proxies may send Host that does not exactly match `host` (or vary by hop).
  // Restrictive allowedHosts breaks HTML/asset responses and surfaces confusing client errors.
  const allowedHosts = true;

  const devPort = Number(env.PORT || process.env.PORT || 3150);

  let hmrConfig;
  if (host === "localhost" || host === "127.0.0.1") {
    hmrConfig = {
      protocol: "ws" as const,
      host: "localhost",
      port: 64999,
      clientPort: 64999,
    };
  } else {
    hmrConfig = {
      protocol: "wss" as const,
      host: host,
      port: parseInt(env.FRONTEND_PORT || process.env.FRONTEND_PORT || "8002", 10),
      clientPort: 443,
    };
  }

  return {
    server: {
      allowedHosts,
      cors: {
        preflightContinue: true,
      },
      port: devPort,
      hmr: hmrConfig,
      fs: {
        allow: ["app", "node_modules"],
      },
    },
    plugins: [
      remix({
        ignoredRouteFiles: ["**/.*"],
        future: {
          v3_fetcherPersist: true,
          v3_relativeSplatPath: true,
          v3_throwAbortReason: true,
          v3_lazyRouteDiscovery: true,
          v3_singleFetch: false,
          v3_routeConfig: true,
        },
      }),
      tsconfigPaths(),
    ],
    build: {
      assetsInlineLimit: 0,
    },
    optimizeDeps: {
      include: ["@shopify/app-bridge-react", "@shopify/polaris"],
    },
  } satisfies UserConfig;
});
