/** A release and its key. Each side holds one release per key; a page release's id is the id it gets if added. */
type KeyedRelease = { readonly id: string; readonly key: string };

type Changes = {
  readonly staleReleaseIds: readonly string[];
  readonly addedReleaseIds: readonly string[];
};

export type ReleasePlan =
  | ({ readonly kind: "none" } & Changes)
  | ({
      readonly kind: "remap";
      readonly fromReleaseId: string;
      readonly toReleaseId: string;
    } & Changes)
  | ({ readonly kind: "clear" } & Changes);

export function buildReleasePlan({
  existing,
  page,
}: {
  readonly existing: readonly KeyedRelease[];
  readonly page: readonly KeyedRelease[];
}): ReleasePlan {
  const storedKeys = new Set(existing.map((release) => release.key));
  const pageKeys = new Set(page.map((release) => release.key));
  const staleReleaseIds = existing
    .filter((release) => !pageKeys.has(release.key))
    .map((release) => release.id);
  const addedReleaseIds = page
    .filter((release) => !storedKeys.has(release.key))
    .map((release) => release.id);
  const [fromReleaseId] = staleReleaseIds;
  const [toReleaseId] = addedReleaseIds;

  if (fromReleaseId === undefined) return { kind: "none", staleReleaseIds: [], addedReleaseIds };
  if (
    existing.length === page.length &&
    staleReleaseIds.length === 1 &&
    addedReleaseIds.length === 1 &&
    toReleaseId !== undefined
  ) {
    return { kind: "remap", staleReleaseIds, addedReleaseIds, fromReleaseId, toReleaseId };
  }
  return { kind: "clear", staleReleaseIds, addedReleaseIds };
}
