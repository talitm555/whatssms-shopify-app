#!/usr/bin/env node
/**
 * Same behavior as `remix-serve`, plus:
 * - `trust proxy` so Express `req.hostname` matches reverse proxies
 * - CSRF Host/Origin alignment when `SHOPIFY_APP_URL` matches `Origin` (see remix-align-csrf-host.mjs)
 */
import { pathToFileURL } from "node:url";
import path from "node:path";
import os from "node:os";
import express from "express";
import compression from "compression";
import morgan from "morgan";
import sourceMapSupport from "source-map-support";
import { createRequestHandler } from "@remix-run/express";
import { installGlobals } from "@remix-run/node";
import { alignForwardedHostForRemixCsrf } from "./remix-align-csrf-host.mjs";

sourceMapSupport.install();

process.env.NODE_ENV ??= "production";

const buildPathArg = process.argv[2];
if (!buildPathArg) {
  console.error(
    "\n  Usage: node ./scripts/prod-server.mjs <server-build-path>\n  Example: node ./scripts/prod-server.mjs ./build/server/index.js\n",
  );
  process.exit(1);
}

const buildPath = path.resolve(buildPathArg);
const build = await import(pathToFileURL(buildPath).href);

installGlobals({ nativeFetch: build.future?.v3_singleFetch ?? true });

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);

app.use((req, res, next) => {
  alignForwardedHostForRemixCsrf(
    req,
    process.env.SHOPIFY_APP_URL,
    process.env.SHOPIFY_APP_EXTRA_ORIGINS,
  );
  next();
});

app.use(compression());
app.use(
  build.publicPath,
  express.static(build.assetsBuildDirectory, {
    immutable: true,
    maxAge: "1y",
  }),
);
app.use(express.static("public", { maxAge: "1h" }));
app.use(morgan("tiny"));
app.all(
  "*",
  createRequestHandler({ build, mode: process.env.NODE_ENV }),
);

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST;

const onListen = () => {
  const iface = Object.values(os.networkInterfaces())
    .flat()
    .find((ip) => String(ip?.family).includes("4") && !ip?.internal);
  const addr = host ?? iface?.address;
  if (!addr) {
    console.log(`[whatssms] http://localhost:${port}`);
  } else {
    console.log(`[whatssms] http://localhost:${port} (http://${addr}:${port})`);
  }
};

const server = host ? app.listen(port, host, onListen) : app.listen(port, onListen);

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.once(signal, () => server.close(console.error));
}
