import type { DataTransferReleaseFingerprint } from "@myakiba/contracts/data-transfer/schema";
import { v5 as uuidv5 } from "uuid";

export type CatalogRelease = DataTransferReleaseFingerprint & { id: string };

export function selectRelease({
  releases,
  requested,
}: {
  readonly releases: readonly CatalogRelease[];
  readonly requested: DataTransferReleaseFingerprint;
}):
  | { readonly kind: "requested"; readonly release: CatalogRelease }
  | { readonly kind: "substitute"; readonly release: CatalogRelease | null } {
  let exactFingerprint: CatalogRelease | null = null;
  let matchingDate: CatalogRelease | null = null;
  let latest: CatalogRelease | null = null;

  for (const release of releases) {
    if (
      release.date === requested.date &&
      (matchingDate === null || release.id < matchingDate.id)
    ) {
      matchingDate = release;
    }

    const fingerprintMatches =
      release.date === requested.date &&
      release.type === requested.type &&
      release.price === requested.price &&
      release.priceCurrency === requested.priceCurrency &&
      release.barcode === requested.barcode;
    if (fingerprintMatches && (exactFingerprint === null || release.id < exactFingerprint.id)) {
      exactFingerprint = release;
    }

    if (
      latest === null ||
      release.date > latest.date ||
      (release.date === latest.date && release.id < latest.id)
    ) {
      latest = release;
    }
  }

  if (exactFingerprint) return { kind: "requested", release: exactFingerprint };
  return { kind: "substitute", release: matchingDate ?? latest };
}

export function createImportId({
  userId,
  exportId,
  kind,
  localKey,
}: {
  readonly userId: string;
  readonly exportId: string;
  readonly kind: "order" | "collection";
  readonly localKey: string;
}): string {
  return uuidv5(
    JSON.stringify([userId, exportId, kind, localKey]),
    "85f8f00e-44c6-4e07-8d8d-e99d5e351daa",
  );
}
