/**
 * Decides how a resync should handle collection rows that still point at
 * release IDs no longer present in the latest scrape.
 *
 * - `none`: no previously known release disappeared
 * - `remap`: exactly one stale release was replaced by exactly one new release
 * - `clear`: the change is ambiguous, so affected selections must be cleared
 */
export type ReleasePlan =
  | {
      readonly kind: "none";
      readonly staleReleaseIds: readonly string[];
    }
  | {
      readonly kind: "remap";
      readonly staleReleaseIds: readonly string[];
      readonly fromReleaseId: string;
      readonly toReleaseId: string;
    }
  | {
      readonly kind: "clear";
      readonly staleReleaseIds: readonly string[];
    };

/**
 * Uses only release ID set changes to detect the single "obvious" remap case.
 *
 * We intentionally do not inspect dates, prices, barcodes, or types here,
 * because those fields are not reliable enough to prove release identity.
 */
export function buildReleasePlan({
  existingReleaseIds,
  scrapedReleaseIds,
}: {
  readonly existingReleaseIds: readonly string[];
  readonly scrapedReleaseIds: readonly string[];
}): ReleasePlan {
  const existingReleaseIdSet = new Set(existingReleaseIds);
  const scrapedReleaseIdSet = new Set(scrapedReleaseIds);
  const staleReleaseIds = existingReleaseIds.filter(
    (releaseId) => !scrapedReleaseIdSet.has(releaseId),
  );
  const addedReleaseIds = scrapedReleaseIds.filter(
    (releaseId) => !existingReleaseIdSet.has(releaseId),
  );

  if (staleReleaseIds.length === 0) {
    return {
      kind: "none",
      staleReleaseIds: [],
    };
  }

  const isObviousOneToOneRemap =
    existingReleaseIds.length === scrapedReleaseIds.length &&
    staleReleaseIds.length === 1 &&
    addedReleaseIds.length === 1;

  if (isObviousOneToOneRemap) {
    return {
      kind: "remap",
      staleReleaseIds,
      fromReleaseId: staleReleaseIds[0],
      toReleaseId: addedReleaseIds[0],
    };
  }

  return {
    kind: "clear",
    staleReleaseIds,
  };
}
