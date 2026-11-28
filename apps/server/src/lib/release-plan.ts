/**
 * A release, its key, and the fields that tell which page release a changed one became. Each side
 * holds one release per key; a page release's id is the id it gets if added.
 */
type PlannedRelease = {
  readonly id: string;
  readonly key: string;
  readonly date: string;
  readonly type: string | null;
  readonly priceCurrency: string | null;
};

/** A stored release the page no longer lists, and the added page release it became. */
type Move = { readonly from: string; readonly to: string };

/** Selections of a stale release in `moves` move to its added release; all other stale selections clear. */
export type ReleasePlan = {
  readonly staleReleaseIds: readonly string[];
  readonly addedReleaseIds: readonly string[];
  readonly moves: readonly Move[];
};

const apart = (a: PlannedRelease, b: PlannedRelease) =>
  Math.abs(Date.parse(a.date) - Date.parse(b.date));

/** The one release of `candidates` with the same type and currency nearest `release`, or none on a tie. */
function nearest(release: PlannedRelease, candidates: readonly PlannedRelease[]) {
  let best: PlannedRelease | undefined;
  let bestApart = Infinity;
  let tied = false;
  for (const candidate of candidates) {
    if (candidate.type !== release.type || candidate.priceCurrency !== release.priceCurrency)
      continue;
    const distance = apart(release, candidate);
    if (distance === bestApart) tied = true;
    if (distance < bestApart) [best, bestApart, tied] = [candidate, distance, false];
  }
  return tied ? undefined : best;
}

/**
 * One stale and one added release always pair. Otherwise a stale and an added release pair only
 * when each is the other's one nearest release of the same type and currency.
 */
function matchReleases(stale: readonly PlannedRelease[], added: readonly PlannedRelease[]) {
  const [onlyStale] = stale;
  const [onlyAdded] = added;
  if (stale.length === 1 && added.length === 1 && onlyStale && onlyAdded) {
    return [{ from: onlyStale.id, to: onlyAdded.id }];
  }
  return stale.flatMap((release): Move[] => {
    const successor = nearest(release, added);
    if (successor === undefined || nearest(successor, stale) !== release) return [];
    return [{ from: release.id, to: successor.id }];
  });
}

export function buildReleasePlan({
  existing,
  page,
}: {
  readonly existing: readonly PlannedRelease[];
  readonly page: readonly PlannedRelease[];
}): ReleasePlan {
  const storedKeys = new Set(existing.map((release) => release.key));
  const pageKeys = new Set(page.map((release) => release.key));
  const stale = existing.filter((release) => !pageKeys.has(release.key));
  const added = page.filter((release) => !storedKeys.has(release.key));
  return {
    staleReleaseIds: stale.map((release) => release.id),
    addedReleaseIds: added.map((release) => release.id),
    moves: matchReleases(stale, added),
  };
}
