const RECENT_TERM_COUNT = 6;

/** A shop or tag the user saved, with every use of that exact spelling. */
type RankedTerm = {
  readonly value: string;
  readonly uses: number;
  readonly lastUsedAt: string;
};

type TermGroup = {
  readonly key: string;
  readonly value: string;
  readonly valueUses: number;
  readonly uses: number;
  readonly lastUsedAt: string;
};

export function normalizeTerm(term: string): string {
  return term.replaceAll(/\s+/g, "").toLowerCase();
}

function groupTerms(terms: readonly RankedTerm[]): Map<string, TermGroup> {
  const groups = new Map<string, TermGroup>();
  for (const term of terms) {
    const key = normalizeTerm(term.value);
    if (!key) continue;
    const uses = term.uses;
    const group = groups.get(key);
    if (!group) {
      groups.set(key, {
        key,
        value: term.value,
        valueUses: uses,
        uses,
        lastUsedAt: term.lastUsedAt,
      });
      continue;
    }
    const spelling = uses > group.valueUses ? { value: term.value, valueUses: uses } : group;
    groups.set(key, {
      key,
      value: spelling.value,
      valueUses: spelling.valueUses,
      uses: group.uses + uses,
      lastUsedAt: term.lastUsedAt > group.lastUsedAt ? term.lastUsedAt : group.lastUsedAt,
    });
  }
  return groups;
}

const byRecency = (a: TermGroup, b: TermGroup) => b.lastUsedAt.localeCompare(a.lastUsedAt);

/** The terms to suggest for `query`: recent terms when it is empty, else prefix matches before substring matches. */
export function rankTerms(terms: readonly RankedTerm[], query: string, limit = 8): string[] {
  const groups = [...groupTerms(terms).values()];
  const typed = normalizeTerm(query);
  if (!typed) {
    return groups
      .toSorted(byRecency)
      .slice(0, Math.min(limit, RECENT_TERM_COUNT))
      .map((group) => group.value);
  }
  const matchRank = (group: TermGroup) => (group.key.startsWith(typed) ? 0 : 1);
  return groups
    .filter((group) => group.key.includes(typed))
    .toSorted((a, b) => matchRank(a) - matchRank(b) || b.uses - a.uses || byRecency(a, b))
    .slice(0, limit)
    .map((group) => group.value);
}
