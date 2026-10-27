import { EXTENSION_MIN_BROWSER_VERSION } from "@myakiba/contracts/shared/extension-browsers";
import { EXTENSION_LISTINGS } from "@/lib/extension-listings";
import type { ExtensionStore } from "@/lib/extension-listings";
import { describeUserAgent } from "@/lib/user-agent";

/** Where a visitor can get the extension, from their browser and that browser's store. */
export type ExtensionAvailability =
  | { readonly kind: "listed"; readonly store: ExtensionStore; readonly url: string }
  | { readonly kind: "in_review"; readonly store: ExtensionStore }
  | { readonly kind: "unsupported" };

// Edge, Opera, Brave and every other Chromium browser carry Chrome's token and version.
const STORE_BROWSERS: readonly { readonly store: ExtensionStore; readonly version: RegExp }[] = [
  { store: "chromeWebStore", version: /Chrome\/(\d+)/u },
  { store: "firefoxAddons", version: /Firefox\/(\d+)/u },
];

/** The store whose extension runs in this browser, or null when none does. */
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
  return url === null ? { kind: "in_review", store } : { kind: "listed", store, url };
}
