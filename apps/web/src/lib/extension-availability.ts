import { EXTENSION_MIN_BROWSER_VERSION } from "@myakiba/contracts/shared/extension-browsers";
import { EXTENSION_LISTINGS, EXTENSION_STORES } from "@/lib/extension-listings";
import type { ExtensionStore } from "@/lib/extension-listings";
import { describeUserAgent } from "@/lib/user-agent";

/** A store that lists the extension, and its listing. */
export type ExtensionListing = { readonly store: ExtensionStore; readonly url: string };

/**
 * Where a visitor can get the extension, from their browser and that browser's store. While their
 * store reviews it, `alternative` is a listing for another browser, if one exists.
 */
export type ExtensionAvailability =
  | ({ readonly kind: "listed" } & ExtensionListing)
  | {
      readonly kind: "in_review";
      readonly store: ExtensionStore;
      readonly alternative: ExtensionListing | null;
    }
  | { readonly kind: "unsupported" };

// Edge, Opera, Brave and every other Chromium browser carry Chrome's token and version.
const STORE_BROWSERS: readonly { readonly store: ExtensionStore; readonly version: RegExp }[] = [
  { store: "chromeWebStore", version: /Chrome\/(\d+)/u },
  { store: "firefoxAddons", version: /Firefox\/(\d+)/u },
];

/**
 * The store whose extension runs in this browser, or null when none does. An Android tablet in
 * Chrome's desktop mode sends a desktop Linux user agent, so it reads as desktop here.
 */
export function storeForBrowser(userAgent: string): ExtensionStore | null {
  if (describeUserAgent(userAgent).kind !== "desktop") return null;
  const browser = STORE_BROWSERS.find(
    ({ version }) => Number(version.exec(userAgent)?.[1]) >= EXTENSION_MIN_BROWSER_VERSION,
  );
  return browser?.store ?? null;
}

export function extensionAvailability(
  userAgent: string = navigator.userAgent,
): ExtensionAvailability {
  const store = storeForBrowser(userAgent);
  if (store === null) return { kind: "unsupported" };
  const url = EXTENSION_LISTINGS[store];
  if (url !== null) return { kind: "listed", store, url };
  const alternative = EXTENSION_STORES.flatMap((other) => {
    const listing = EXTENSION_LISTINGS[other];
    return listing === null ? [] : [{ store: other, url: listing }];
  })[0];
  return { kind: "in_review", store, alternative: alternative ?? null };
}
