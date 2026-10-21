export type Origins = {
  readonly web: string;
  readonly mfc: string;
  readonly mfcStatic: string;
};

const CANONICAL_ORIGINS = new Map<string, "mfc" | "mfcStatic">([
  ["https://myfigurecollection.net", "mfc"],
  ["https://static.myfigurecollection.net", "mfcStatic"],
]);

export function toConfiguredUrl(canonical: string, origins: Origins): URL | null {
  const url = URL.parse(canonical);
  const key = url ? CANONICAL_ORIGINS.get(url.origin) : undefined;
  if (!url || !key) return null;
  return new URL(`${url.pathname}${url.search}`, origins[key]);
}

export function mfcItemUrl(mfcItemId: number, origins: Origins): string {
  return `${origins.mfc}/item/${mfcItemId}`;
}
