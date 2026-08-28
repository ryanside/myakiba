import type { DataTransferReleaseFingerprint } from "@myakiba/contracts/data-transfer/schema";
import { v5 as uuidv5 } from "uuid";

export type ItemRelease = DataTransferReleaseFingerprint & { id: string };

export function selectRelease({
  releases,
  requested,
}: {
  readonly releases: readonly ItemRelease[];
  readonly requested: DataTransferReleaseFingerprint;
}):
  | { readonly kind: "requested"; readonly release: ItemRelease }
  | { readonly kind: "substitute"; readonly release: ItemRelease | null } {
  let exactFingerprint: ItemRelease | null = null;
  let matchingDate: ItemRelease | null = null;
  let latest: ItemRelease | null = null;

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
  importId,
  kind,
  localKey,
}: {
  readonly userId: string;
  readonly importId: string;
  readonly kind: "order" | "collection";
  readonly localKey: string;
}): string {
  return uuidv5(
    JSON.stringify([userId, importId, kind, localKey]),
    "85f8f00e-44c6-4e07-8d8d-e99d5e351daa",
  );
}
