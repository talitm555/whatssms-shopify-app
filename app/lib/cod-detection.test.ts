import { describe, expect, it } from "vitest";
import {
  confirmationTagForChannel,
  isLikelyCodOrder,
} from "./cod-detection.server";

describe("isLikelyCodOrder", () => {
  it("detects COD from gateway name", () => {
    expect(
      isLikelyCodOrder({
        payment_gateway_names: ["Cash on Delivery (COD)"],
        financial_status: "pending",
      }),
    ).toBe(true);
  });

  it("detects manual pending payments", () => {
    expect(
      isLikelyCodOrder({
        payment_gateway_names: ["manual"],
        financial_status: "pending",
      }),
    ).toBe(true);
  });

  it("respects custom gateway hints", () => {
    expect(
      isLikelyCodOrder(
        { payment_gateway_names: ["bogus"] },
        ["bogus"],
      ),
    ).toBe(true);
  });

  it("returns false for plain card gateway", () => {
    expect(
      isLikelyCodOrder({
        payment_gateway_names: ["shopify_payments"],
        financial_status: "paid",
      }),
    ).toBe(false);
  });
});

describe("confirmationTagForChannel", () => {
  it("returns exact Shopify tag strings", () => {
    expect(confirmationTagForChannel("sms", "confirm")).toBe("confirmed_via_sms");
    expect(confirmationTagForChannel("whatsapp", "confirm")).toBe(
      "confirmed_via_whatsapp",
    );
    expect(confirmationTagForChannel("sms", "reject")).toBe("rejected_via_sms");
    expect(confirmationTagForChannel("whatsapp", "reject")).toBe(
      "rejected_via_whatsapp",
    );
  });
});
