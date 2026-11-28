const GENERIC_SUFFIX = /(?<=.)\.(?:com|net|org|shop|store)$/;

/**
 * What two Shop names share when they name one Shop: the same text once width, case, whitespace
 * and one trailing .com, .net, .org, .shop or .store are ignored. An empty key matches nothing.
 */
export function shopKey(shop: string): string {
  return shop.normalize("NFKC").toLowerCase().replaceAll(/\s+/g, "").replace(GENERIC_SUFFIX, "");
}
