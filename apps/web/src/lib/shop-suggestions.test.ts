import { describe, expect, test } from "bun:test";
import type { ShopTerm } from "@myakiba/contracts/vocabulary/schema";
import { canonicalShop, normalizeShop, rankShops } from "./shop-suggestions";

const term = (value: string, uses: number, day: number, orderUses = 0): ShopTerm => ({
  value,
  collectionUses: uses,
  orderUses,
  lastUsedAt: new Date(Date.UTC(2026, 0, day)).toISOString(),
});

describe("normalizeShop", () => {
  test("drops all whitespace and lowercases", () => {
    expect(normalizeShop("  Ami \t  Ami  ")).toBe("amiami");
  });
});

describe("rankShops", () => {
  test("suggests the six most recent shops for an empty query", () => {
    const terms = Array.from({ length: 8 }, (_, day) => term(`Shop ${day}`, 10 - day, day + 1));

    expect(rankShops(terms, "  ")).toEqual([
      "Shop 7",
      "Shop 6",
      "Shop 5",
      "Shop 4",
      "Shop 3",
      "Shop 2",
    ]);
  });

  test("puts prefix matches before substring matches, then more uses, then recency", () => {
    const terms = [
      term("Big Amiibo Shop", 50, 1),
      term("Amazon", 1, 1),
      term("AmiAmi", 5, 1),
      term("Amiami Outlet", 5, 2),
    ];

    expect(rankShops(terms, "am")).toEqual([
      "Amiami Outlet",
      "AmiAmi",
      "Amazon",
      "Big Amiibo Shop",
    ]);
  });

  test("matches spacing and case loosely", () => {
    expect(rankShops([term("Ami Ami", 1, 1)], "AMI  a")).toEqual(["Ami Ami"]);
  });

  test("shows one spelling per shop, the most used one, ranked by their combined uses", () => {
    const terms = [
      term("Mandarake", 4, 1),
      term("amiami", 1, 3),
      term("AmiAmi", 2, 1, 1),
      term(" AMIAMI ", 1, 2),
    ];

    expect(rankShops(terms, "a")).toEqual(["AmiAmi", "Mandarake"]);
  });

  test("stops at the limit", () => {
    const terms = Array.from({ length: 12 }, (_, index) => term(`Shop ${index}`, 1, 1));

    expect(rankShops(terms, "shop")).toHaveLength(8);
    expect(rankShops(terms, "shop", 3)).toHaveLength(3);
  });
});

describe("canonicalShop", () => {
  const terms = [term("AmiAmi", 3, 1), term("amiami", 1, 2)];

  test("uses the most-used spelling of a known shop", () => {
    expect(canonicalShop(terms, "amiami ")).toBe("AmiAmi");
    expect(canonicalShop(terms, "AMIAMI")).toBe("AmiAmi");
  });

  test("folds a known shop typed with extra spaces", () => {
    expect(canonicalShop(terms, "  Ami Ami ")).toBe("AmiAmi");
  });

  test("keeps a new shop as typed, trimmed", () => {
    expect(canonicalShop(terms, "  Hobby Search ")).toBe("Hobby Search");
    expect(canonicalShop(terms, "")).toBe("");
  });
});
