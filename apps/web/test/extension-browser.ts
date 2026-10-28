import { mock } from "bun:test";
import type { ExtensionListings, ExtensionStore } from "@/lib/extension-listings";

export const LISTING_URLS = {
  chromeWebStore: "https://chromewebstore.google.com/detail/myakiba/fixture",
  firefoxAddons: "https://addons.mozilla.org/firefox/addon/myakiba/",
} as const satisfies Record<ExtensionStore, string>;

export const SUPPORTED_BROWSERS = [
  {
    name: "Chrome",
    store: "chromeWebStore",
    storeName: "the Chrome Web Store",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  },
  {
    name: "Firefox",
    store: "firefoxAddons",
    storeName: "Firefox Add-ons",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:141.0) Gecko/20100101 Firefox/141.0",
  },
] as const;

export type SupportedBrowser = (typeof SUPPORTED_BROWSERS)[number];

export const SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

type Listings = { -readonly [Store in keyof ExtensionListings]: ExtensionListings[Store] };

const STORES = ["chromeWebStore", "firefoxAddons"] as const satisfies readonly ExtensionStore[];
const listings: Listings = { chromeWebStore: null, firefoxAddons: null };
await mock.module("@/lib/extension-listings", () => ({
  EXTENSION_STORES: STORES,
  EXTENSION_LISTINGS: listings,
}));

/** Lists the extension in these stores, and leaves every other store reviewing it. */
export function listIn(...stores: readonly ExtensionStore[]) {
  for (const store of STORES) {
    listings[store] = stores.includes(store) ? LISTING_URLS[store] : null;
  }
}

export function browseWith(userAgent: string) {
  Object.defineProperty(navigator, "userAgent", { value: userAgent, configurable: true });
}
