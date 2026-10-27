import { expect, test } from "bun:test";
import { listIn } from "../../test/extension-browser";
import type { ExtensionStore } from "./extension-listings";

const { extensionAvailability, storeForBrowser } = await import("./extension-availability");

const CHROMIUM = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)";

test.each<readonly [string, string, ExtensionStore | null]>([
  ["Chrome on Windows", `${CHROMIUM} Chrome/141.0.0.0 Safari/537.36`, "chromeWebStore"],
  ["Edge", `${CHROMIUM} Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0`, "chromeWebStore"],
  ["Opera", `${CHROMIUM} Chrome/141.0.0.0 Safari/537.36 OPR/125.0.0.0`, "chromeWebStore"],
  [
    "Chrome on ChromeOS",
    "Mozilla/5.0 (X11; CrOS x86_64 16000.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    "chromeWebStore",
  ],
  [
    "Firefox on macOS",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0",
    "firefoxAddons",
  ],
  [
    "Firefox on Linux",
    "Mozilla/5.0 (X11; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0",
    "firefoxAddons",
  ],
  ["Chrome before 140", `${CHROMIUM} Chrome/139.0.0.0 Safari/537.36`, null],
  [
    "Firefox ESR 128",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
    null,
  ],
  [
    "Firefox for Android",
    "Mozilla/5.0 (Android 15; Mobile; rv:141.0) Gecko/141.0 Firefox/141.0",
    null,
  ],
  [
    "Chrome on Android",
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
    null,
  ],
  [
    "Chrome on an Android tablet",
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    null,
  ],
  [
    "Chrome on iPhone",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1",
    null,
  ],
  [
    "Safari on macOS",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
    null,
  ],
])("%s gets the extension from %p", (_name, userAgent, store) => {
  expect(storeForBrowser(userAgent)).toBe(store);
});

test("each store's availability follows only its own listing", () => {
  const chrome = `${CHROMIUM} Chrome/141.0.0.0 Safari/537.36`;
  const firefox = "Mozilla/5.0 (X11; Linux x86_64; rv:141.0) Gecko/20100101 Firefox/141.0";

  listIn("chromeWebStore");

  expect(extensionAvailability(chrome)).toEqual({
    kind: "listed",
    store: "chromeWebStore",
    url: "https://chromewebstore.google.com/detail/myakiba/fixture",
  });
  expect(extensionAvailability(firefox)).toEqual({ kind: "in_review", store: "firefoxAddons" });
  expect(extensionAvailability("Mozilla/5.0 (iPhone) Mobile Safari/604.1")).toEqual({
    kind: "unsupported",
  });
});
