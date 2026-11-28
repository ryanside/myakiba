const GENERIC_SUFFIX = /(?<=.)\.(?:com|net|org|shop|store)$/;

/** What two Shop names share when they name one Shop. */
export function shopKey(shop: string): string {
  return shop.normalize("NFKC").toLowerCase().replaceAll(/\s+/g, "").replace(GENERIC_SUFFIX, "");
}
