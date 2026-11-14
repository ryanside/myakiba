import { describe, expect, test } from "bun:test";
import type { ShopTerm, TagTerm } from "@myakiba/contracts/vocabulary/schema";
import { normalizeTerm, rankTerms } from "./vocabulary-suggestions";

const term = (value: string, uses: number, day: number, orderUses = 0): ShopTerm => ({
  value,
  uses: uses + orderUses,
  ownedUses: uses,
  orderUses,
  lastUsedAt: new Date(Date.UTC(2026, 0, day)).toISOString(),
});

describe("normalizeTerm", () => {
  test("drops all whitespace and lowercases", () => {
    expect(normalizeTerm("  Ami \t  Ami  ")).toBe("amiami");
  });
});

describe("rankTerms", () => {
  test("suggests the six most recent shops for an empty query", () => {
    const terms = Array.from({ length: 8 }, (_, day) => term(`Shop ${day}`, 10 - day, day + 1));

    expect(rankTerms(terms, "  ")).toEqual([
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

    expect(rankTerms(terms, "am")).toEqual([
      "Amiami Outlet",
      "AmiAmi",
      "Amazon",
      "Big Amiibo Shop",
    ]);
  });

  test("matches spacing and case loosely", () => {
    expect(rankTerms([term("Ami Ami", 1, 1)], "AMI  a")).toEqual(["Ami Ami"]);
  });

  test("shows one spelling per shop, the most used one, ranked by their combined uses", () => {
    const terms = [
      term("Mandarake", 4, 1),
      term("amiami", 1, 3),
      term("AmiAmi", 2, 1, 1),
      term(" AMIAMI ", 1, 2),
    ];

    expect(rankTerms(terms, "a")).toEqual(["AmiAmi", "Mandarake"]);
  });

  test("shows the spelling with the most uses, owned or not", () => {
    const terms = [
      { ...term("HobbyLink", 0, 1), uses: 3 },
      { ...term("hobby link", 1, 2), uses: 1 },
    ];

    expect(rankTerms(terms, "hobby")).toEqual(["HobbyLink"]);
  });

  test("stops at the limit", () => {
    const terms = Array.from({ length: 12 }, (_, index) => term(`Shop ${index}`, 1, 1));

    expect(rankTerms(terms, "shop")).toHaveLength(8);
    expect(rankTerms(terms, "shop", 3)).toHaveLength(3);
  });
});

describe("rankTerms over tags", () => {
  const tag = (value: string, uses: number, day: number): TagTerm => ({
    value,
    uses,
    ownedUses: 0,
    lastUsedAt: new Date(Date.UTC(2026, 0, day)).toISOString(),
  });

  test("shows one tag for every spelling that differs only in case and spaces, in its most-used spelling", () => {
    const tags = [
      tag("favorite", 1, 3),
      tag("Favorite", 3, 1),
      tag("fav orite", 1, 2),
      tag("fan art", 4, 1),
    ];

    expect(rankTerms(tags, "FAV")).toEqual(["Favorite"]);
    expect(rankTerms(tags, "f")).toEqual(["Favorite", "fan art"]);
  });
});
