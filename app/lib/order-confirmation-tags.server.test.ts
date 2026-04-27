import { describe, expect, it } from "vitest";
import {
  orderPayloadHasConfirmationTag,
  parseOrderTagsField,
} from "./order-confirmation-tags.server";

describe("parseOrderTagsField", () => {
  it("splits comma-separated tags", () => {
    expect(parseOrderTagsField("confirmed_via_sms, vip")).toEqual([
      "confirmed_via_sms",
      "vip",
    ]);
  });

  it("returns empty for missing or blank", () => {
    expect(parseOrderTagsField(null)).toEqual([]);
    expect(parseOrderTagsField("")).toEqual([]);
    expect(parseOrderTagsField("   ")).toEqual([]);
  });
});

describe("orderPayloadHasConfirmationTag", () => {
  it("is true when confirmed_via_sms is present", () => {
    expect(
      orderPayloadHasConfirmationTag({ tags: "foo, confirmed_via_sms" }),
    ).toBe(true);
  });

  it("is true when confirmed_via_whatsapp is present", () => {
    expect(
      orderPayloadHasConfirmationTag({ tags: "confirmed_via_whatsapp" }),
    ).toBe(true);
  });

  it("is false when only unrelated tags exist", () => {
    expect(orderPayloadHasConfirmationTag({ tags: "vip, wholesale" })).toBe(
      false,
    );
  });
});
