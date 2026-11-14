import type { ShopTerm, ShopUses } from "@myakiba/contracts/vocabulary/schema";

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

const byUses = (a: ShopTerm, b: ShopTerm) => b.uses - a.uses;

export function shopVariantGroups(terms: readonly ShopTerm[]): readonly (readonly ShopTerm[])[] {
  const spellings = Map.groupBy(terms.toSorted(byUses), (term) => normalizeTerm(term.value));
  return [...spellings.values()].filter((group) => group.length > 1);
}

export function usesOf(terms: readonly ShopTerm[]): ShopUses {
  return {
    collectionItems: terms.reduce((sum, term) => sum + term.uses - term.orderUses, 0),
    orders: terms.reduce((sum, term) => sum + term.orderUses, 0),
  };
}

const counted = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "s"}`;

export function describeUses({ collectionItems, orders }: ShopUses): string {
  const parts = [
    collectionItems > 0 && counted(collectionItems, "Collection Item"),
    orders > 0 && counted(orders, "Order"),
  ].filter((part) => part !== false);
  return parts.length > 0 ? parts.join(" and ") : "No Collection Items or Orders";
}
