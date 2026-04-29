import { afterEach, describe, expect, it } from "vitest";
import {
  appendStrictTransportSecurity,
  httpsRedirectIfNeeded,
} from "./https-enforce.server";

describe("httpsRedirectIfNeeded", () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevDisable = process.env.DISABLE_HTTPS_REDIRECT;

  afterEach(() => {
    process.env.NODE_ENV = prevNodeEnv;
    process.env.DISABLE_HTTPS_REDIRECT = prevDisable;
  });

  it("skips when not in production", () => {
    process.env.NODE_ENV = "development";
    const r = new Request("http://example.com/app");
    expect(httpsRedirectIfNeeded(r)).toBeNull();
  });

  it("skips when already https (URL)", () => {
    process.env.NODE_ENV = "production";
    const r = new Request("https://ecom.example.com/app");
    expect(httpsRedirectIfNeeded(r)).toBeNull();
  });

  it("skips when X-Forwarded-Proto is https (behind TLS-terminating proxy)", () => {
    process.env.NODE_ENV = "production";
    const r = new Request("http://10.0.0.1:3000/app", {
      headers: { "X-Forwarded-Proto": "https", "X-Forwarded-Host": "ecom.example.com" },
    });
    expect(httpsRedirectIfNeeded(r)).toBeNull();
  });

  it("redirects http to https in production", () => {
    process.env.NODE_ENV = "production";
    const r = new Request("http://ecom.example.com/ready?x=1");
    const res = httpsRedirectIfNeeded(r);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(308);
    expect(res!.headers.get("Location")).toBe("https://ecom.example.com/ready?x=1");
  });
});

describe("appendStrictTransportSecurity", () => {
  const prevNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = prevNodeEnv;
  });

  it("sets HSTS in production", () => {
    process.env.NODE_ENV = "production";
    const h = new Headers();
    appendStrictTransportSecurity(h);
    expect(h.get("Strict-Transport-Security")).toBe("max-age=31536000");
  });

  it("skips HSTS outside production", () => {
    process.env.NODE_ENV = "test";
    const h = new Headers();
    appendStrictTransportSecurity(h);
    expect(h.get("Strict-Transport-Security")).toBeNull();
  });
});
