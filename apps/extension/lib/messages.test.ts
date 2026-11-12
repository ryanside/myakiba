import { describe, expect, test } from "bun:test";
import { MAX_PICK_TITLE } from "@myakiba/contracts/add/constants";
import { itemId } from "../test/fake-browser";
import { fromMfcPageSchema, mfcPageStateSchema, pickCaptureSchema } from "./messages";

const MAX_PAGE_BYTES = 2 * 1024 * 1024;

const capture = {
  mfcItemId: 98_777,
  title: "Rem",
  html: "<html></html>",
  picture: { base64: "/9j/", contentType: "image/jpeg" },
};

describe("what a click on Pick captured", () => {
  test("is the Item's page, title and picture, or no title and no picture", () => {
    expect(pickCaptureSchema.parse(capture)).toEqual({ ...capture, mfcItemId: itemId(98_777) });
    expect(pickCaptureSchema.safeParse({ ...capture, title: null, picture: null }).success).toBe(
      true,
    );
  });

  test("takes a page up to the server's 2 MB, counted in UTF-8 bytes", () => {
    const withPage = (html: string) => pickCaptureSchema.safeParse({ ...capture, html }).success;

    expect(withPage("a".repeat(MAX_PAGE_BYTES))).toBe(true);
    expect(withPage("a".repeat(MAX_PAGE_BYTES + 1))).toBe(false);
    expect(withPage("レ".repeat(MAX_PAGE_BYTES / 2))).toBe(false);
  });

  test.each([
    ["an empty page", { html: "" }],
    ["a title over the cap", { title: "R".repeat(MAX_PICK_TITLE + 1) }],
    ["a string id", { mfcItemId: "98777" }],
    ["a picture that is not base64", { picture: { base64: "%", contentType: "image/jpeg" } }],
    ["a field more", { url: "https://myfigurecollection.net/item/98777" }],
  ])("with %s is refused", (_, overrides) => {
    expect(pickCaptureSchema.safeParse({ ...capture, ...overrides }).success).toBe(false);
  });
});

describe("a message from an MFC page", () => {
  test("mfc-hello has no fields", () => {
    expect(fromMfcPageSchema.parse({ type: "mfc-hello" })).toEqual({ type: "mfc-hello" });
  });

  test.each([
    ["a URL", { url: "https://myfigurecollection.net/item/98777" }],
    ["an id", { mfcItemId: 98_777 }],
    ["a page", { html: "<html></html>" }],
    ["a title", { title: "Rem" }],
  ])("mfc-hello with %s is refused", (_, fields) => {
    expect(fromMfcPageSchema.safeParse({ type: "mfc-hello", ...fields }).success).toBe(false);
  });

  test("mfc-pick carries the capture, and is refused when its capture is", () => {
    expect(fromMfcPageSchema.parse({ type: "mfc-pick", capture })).toEqual({
      type: "mfc-pick",
      capture: { ...capture, mfcItemId: itemId(98_777) },
    });
    expect(
      fromMfcPageSchema.safeParse({ type: "mfc-pick", capture: { ...capture, html: "" } }).success,
    ).toBe(false);
  });

  test("mfc-unpick names only the Item", () => {
    expect(fromMfcPageSchema.parse({ type: "mfc-unpick", mfcItemId: 98_777 })).toEqual({
      type: "mfc-unpick",
      mfcItemId: itemId(98_777),
    });
    expect(
      fromMfcPageSchema.safeParse({ type: "mfc-unpick", mfcItemId: 98_777, html: "" }).success,
    ).toBe(false);
  });

  test("another type is refused", () => {
    expect(fromMfcPageSchema.safeParse({ type: "take-picks" }).success).toBe(false);
  });
});

describe("the background's answer to an MFC page", () => {
  const state = { picked: true, count: 3, full: false, refused: null };

  test("says whether the Item is picked, how many picks the context has, and any refusal", () => {
    expect(mfcPageStateSchema.parse(state)).toEqual(state);
    expect(
      mfcPageStateSchema.safeParse({ ...state, picked: false, full: true, refused: "full" })
        .success,
    ).toBe(true);
    expect(mfcPageStateSchema.safeParse({ ...state, refused: "storage_failed" }).success).toBe(
      true,
    );
  });

  test.each([
    ["another refusal", { refused: "sfw_hidden" }],
    ["a negative count", { count: -1 }],
    ["a field more", { title: "Rem" }],
  ])("with %s is refused", (_, overrides) => {
    expect(mfcPageStateSchema.safeParse({ ...state, ...overrides }).success).toBe(false);
  });
});
