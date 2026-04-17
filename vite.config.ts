import { vitePlugin as remix } from "@remix-run/dev";
import { installGlobals } from "@remix-run/node";
import { defineConfig, loadEnv, type UserConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

installGlobals({ nativeFetch: true });

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

  // Visiting http://127.0.0.1 while SHOPIFY_APP_URL uses "localhost" must still
  // be allowed or Vite can block the Host header and break CSS/asset URLs.
  const allowedHosts = [...new Set([host, "localhost", "127.0.0.1"])];

  const devPort = Number(env.PORT || process.env.PORT || 3000);

  // `shopify app dev` serves the app at https://localhost:PORT (CLI proxy + cert)
  // while SHOPIFY_APP_URL in .env is often your public tunnel host. If HMR targets
  // that remote host, the Vite client on https://localhost:PORT cannot connect → blank/black page.
  // Set VITE_HMR_TUNNEL=1 only when you open the dev server via that tunnel URL (not the CLI proxy).
  const useRemoteTunnelHmr =
    env.VITE_HMR_TUNNEL === "1" || process.env.VITE_HMR_TUNNEL === "1";

  let hmrConfig;
  if (host === "localhost" || host === "127.0.0.1") {
    hmrConfig = {
      protocol: "ws" as const,
      host: "localhost",
      port: 64999,
      clientPort: 64999,
    };
  } else if (!useRemoteTunnelHmr) {
    hmrConfig = {
      protocol: "wss" as const,
      host: "localhost",
      port: devPort,
      clientPort: devPort,
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
      // Correct absolute asset URLs when the browser origin is https://localhost:PORT (Shopify proxy).
      ...(!useRemoteTunnelHmr &&
        host !== "localhost" &&
        host !== "127.0.0.1" && {
          origin: `https://localhost:${devPort}`,
        }),
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
