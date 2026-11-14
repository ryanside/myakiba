import type { ShopTerm } from "@myakiba/contracts/vocabulary/schema";

const RECENT_SHOP_COUNT = 6;

type ShopGroup = {
  readonly key: string;
  readonly value: string;
  readonly valueUses: number;
  readonly uses: number;
  readonly lastUsedAt: string;
};

export function normalizeShop(shop: string): string {
  return shop.replaceAll(/\s+/g, "").toLowerCase();
}

const usesOf = (term: ShopTerm) => term.ownedUses + term.orderUses;

function groupShops(terms: readonly ShopTerm[]): Map<string, ShopGroup> {
  const groups = new Map<string, ShopGroup>();
  for (const term of terms) {
    const key = normalizeShop(term.value);
    if (!key) continue;
    const uses = usesOf(term);
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

const byRecency = (a: ShopGroup, b: ShopGroup) => b.lastUsedAt.localeCompare(a.lastUsedAt);

/** The shops to suggest for `query`: recent shops when it is empty, else prefix matches before substring matches. */
export function rankShops(terms: readonly ShopTerm[], query: string, limit = 8): string[] {
  const groups = [...groupShops(terms).values()];
  const typed = normalizeShop(query);
  if (!typed) {
    return groups
      .toSorted(byRecency)
      .slice(0, Math.min(limit, RECENT_SHOP_COUNT))
      .map((group) => group.value);
  }
  const matchRank = (group: ShopGroup) => (group.key.startsWith(typed) ? 0 : 1);
  return groups
    .filter((group) => group.key.includes(typed))
    .toSorted((a, b) => matchRank(a) - matchRank(b) || b.uses - a.uses || byRecency(a, b))
    .slice(0, limit)
    .map((group) => group.value);
}

/** The known spelling of `typed` when the user already saved that shop, else `typed` trimmed. */
export function canonicalShop(terms: readonly ShopTerm[], typed: string): string {
  return groupShops(terms).get(normalizeShop(typed))?.value ?? typed.trim();
}
