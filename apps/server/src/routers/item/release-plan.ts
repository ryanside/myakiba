export type ReleasePlan =
  | { readonly kind: "none"; readonly staleReleaseIds: readonly string[] }
  | {
      readonly kind: "remap";
      readonly staleReleaseIds: readonly string[];
      readonly fromReleaseId: string;
      readonly toReleaseId: string;
    }
  | { readonly kind: "clear"; readonly staleReleaseIds: readonly string[] };

export function buildReleasePlan({
  existingReleaseIds,
  pageReleaseIds,
}: {
  readonly existingReleaseIds: readonly string[];
  readonly pageReleaseIds: readonly string[];
}): ReleasePlan {
  const existing = new Set(existingReleaseIds);
  const onPage = new Set(pageReleaseIds);
  const staleReleaseIds = existingReleaseIds.filter((id) => !onPage.has(id));
  const addedReleaseIds = pageReleaseIds.filter((id) => !existing.has(id));
  const [fromReleaseId] = staleReleaseIds;
  const [toReleaseId] = addedReleaseIds;

  if (fromReleaseId === undefined) return { kind: "none", staleReleaseIds: [] };
  if (
    existingReleaseIds.length === pageReleaseIds.length &&
    staleReleaseIds.length === 1 &&
    addedReleaseIds.length === 1 &&
    toReleaseId !== undefined
  ) {
    return { kind: "remap", staleReleaseIds, fromReleaseId, toReleaseId };
  }
  return { kind: "clear", staleReleaseIds };
}
