export const EXTENSION_STORES = ["chromeWebStore", "firefoxAddons"] as const;

export type ExtensionStore = (typeof EXTENSION_STORES)[number];

/** Each store's listing URL, or null while it reviews the extension. */
export type ExtensionListings = { readonly [Store in ExtensionStore]: string | null };

/** Releasing the extension in a store means setting its listing URL here. */
export const EXTENSION_LISTINGS: ExtensionListings = {
  chromeWebStore: null,
  firefoxAddons: null,
};
