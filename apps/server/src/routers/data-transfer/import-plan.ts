import type {
  DataTransferCollectionItemV1,
  DataTransferReleaseFingerprint,
} from "@myakiba/contracts/data-transfer/schema";
import { v5 as uuidv5 } from "uuid";

type ItemRelease = DataTransferReleaseFingerprint & { readonly id: string };

export type ImportableItem = {
  readonly itemId: string;
  readonly releases: readonly ItemRelease[];
};

export type PlannedCollectionRow = {
  readonly row: DataTransferCollectionItemV1;
  readonly itemId: string;
  readonly releaseId: string | null;
};

export type CollectionPlan = {
  readonly rows: readonly PlannedCollectionRow[];
  readonly rowsByMissingItem: ReadonlyMap<number, readonly DataTransferCollectionItemV1[]>;
  readonly releaseSubstitutions: number;
  readonly missingReleases: number;
};

function selectRelease({
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

const WORKER_IMPORT_ID_NAMESPACE = "85f8f00e-44c6-4e07-8d8d-e99d5e351daa";

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
  return uuidv5(JSON.stringify([userId, importId, kind, localKey]), WORKER_IMPORT_ID_NAMESPACE);
}

export function planCollectionRows(
  rows: readonly DataTransferCollectionItemV1[],
  itemsByExternalId: ReadonlyMap<number, ImportableItem>,
): CollectionPlan {
  const planned: PlannedCollectionRow[] = [];
  const rowsByMissingItem = new Map<number, DataTransferCollectionItemV1[]>();
  let releaseSubstitutions = 0;
  let missingReleases = 0;

  for (const row of rows) {
    const item = itemsByExternalId.get(row.item.externalId);
    if (!item) {
      const waiting = rowsByMissingItem.get(row.item.externalId);
      if (waiting) waiting.push(row);
      else rowsByMissingItem.set(row.item.externalId, [row]);
      continue;
    }

    const requested = row.item.selectedRelease;
    if (requested === null) {
      planned.push({ row, itemId: item.itemId, releaseId: null });
      continue;
    }

    const selection = selectRelease({ releases: item.releases, requested });
    if (selection.kind === "substitute") {
      if (selection.release) releaseSubstitutions += 1;
      else missingReleases += 1;
    }
    planned.push({ row, itemId: item.itemId, releaseId: selection.release?.id ?? null });
  }

  return { rows: planned, rowsByMissingItem, releaseSubstitutions, missingReleases };
}
