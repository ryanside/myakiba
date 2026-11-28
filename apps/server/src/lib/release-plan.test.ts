import { describe, expect, test } from "bun:test";
import { buildReleasePlan } from "./release-plan";

/** Releases told apart by key alone: the same date, type and currency. */
const keyed = (id: string, key: string) => ({
  id,
  key,
  date: "2026-06-01",
  type: "Standard",
  priceCurrency: "JPY",
});

const plan = (storedKeys: string[], pageKeys: string[]) =>
  buildReleasePlan({
    existing: storedKeys.map((key) => keyed(`stored-${key}`, key)),
    page: pageKeys.map((key) => keyed(`new-${key}`, key)),
  });

describe("buildReleasePlan", () => {
  test("the same releases need nothing, whatever their stored ids", () => {
    expect(plan(["a", "b"], ["b", "a"])).toEqual({
      staleReleaseIds: [],
      addedReleaseIds: [],
      moves: [],
    });
  });

  test("only added releases need nothing", () => {
    expect(plan(["a"], ["a", "b"])).toEqual({
      staleReleaseIds: [],
      addedReleaseIds: ["new-b"],
      moves: [],
    });
  });

  test("no releases before and none on the page need nothing", () => {
    expect(plan([], [])).toEqual({ staleReleaseIds: [], addedReleaseIds: [], moves: [] });
  });

  test("one release replaced by one other remaps the selection", () => {
    expect(plan(["a", "b"], ["a", "c"])).toEqual({
      staleReleaseIds: ["stored-b"],
      addedReleaseIds: ["new-c"],
      moves: [{ from: "stored-b", to: "new-c" }],
    });
  });

  test("two releases replaced clears both", () => {
    expect(plan(["a", "b"], ["c", "d"])).toEqual({
      staleReleaseIds: ["stored-a", "stored-b"],
      addedReleaseIds: ["new-c", "new-d"],
      moves: [],
    });
  });

  test("one release replaced while another is added clears it", () => {
    expect(plan(["a", "b"], ["a", "c", "d"])).toEqual({
      staleReleaseIds: ["stored-b"],
      addedReleaseIds: ["new-c", "new-d"],
      moves: [],
    });
  });

  test("two releases replaced by one other clears both", () => {
    expect(plan(["a", "b", "c"], ["a", "d"])).toEqual({
      staleReleaseIds: ["stored-b", "stored-c"],
      addedReleaseIds: ["new-d"],
      moves: [],
    });
  });

  test("a removed release with nothing in its place clears it", () => {
    expect(plan(["a", "b"], ["a"])).toEqual({
      staleReleaseIds: ["stored-b"],
      addedReleaseIds: [],
      moves: [],
    });
  });

  test("every release gone clears them all", () => {
    expect(plan(["a"], [])).toEqual({
      staleReleaseIds: ["stored-a"],
      addedReleaseIds: [],
      moves: [],
    });
  });
});

type Release = {
  readonly name: string;
  readonly date: string;
  readonly type?: string;
  readonly currency?: string;
};

const release = ({ name, date, type = "Standard", currency = "JPY" }: Release) => ({
  id: name,
  key: JSON.stringify([date, type, currency, name]),
  date,
  type,
  priceCurrency: currency,
});

const match = (stored: Release[], page: Release[]) =>
  buildReleasePlan({ existing: stored.map(release), page: page.map(release) }).moves;

describe("buildReleasePlan matches changed releases by type, currency and nearest date", () => {
  test("a date slip with two releases moves each to the release it became", () => {
    expect(
      match(
        [
          { name: "first", date: "2026-06-15" },
          { name: "rerelease", date: "2026-09-15" },
        ],
        [
          { name: "first slipped", date: "2026-07-15" },
          { name: "rerelease slipped", date: "2026-10-15" },
        ],
      ),
    ).toEqual([
      { from: "first", to: "first slipped" },
      { from: "rerelease", to: "rerelease slipped" },
    ]);
  });

  test("an added release beside a changed one leaves the added release alone", () => {
    expect(
      match(
        [{ name: "first", date: "2026-06-15" }],
        [
          { name: "first slipped", date: "2026-07-15" },
          { name: "rerelease", date: "2027-03-01" },
        ],
      ),
    ).toEqual([{ from: "first", to: "first slipped" }]);
  });

  test("a removed release beside a changed one moves only the changed one", () => {
    expect(
      match(
        [
          { name: "first", date: "2026-06-15" },
          { name: "removed", date: "2027-03-01" },
        ],
        [{ name: "first slipped", date: "2026-07-15" }],
      ),
    ).toEqual([{ from: "first", to: "first slipped" }]);
  });

  test("two page releases equally near a stored one move nothing", () => {
    expect(
      match(
        [{ name: "first", date: "2026-06-15" }],
        [
          { name: "earlier", date: "2026-06-01" },
          { name: "later", date: "2026-06-29" },
        ],
      ),
    ).toEqual([]);
  });

  test("two stored releases equally near one page release move nothing", () => {
    expect(
      match(
        [
          { name: "earlier", date: "2026-06-01" },
          { name: "later", date: "2026-06-29" },
        ],
        [{ name: "between", date: "2026-06-15" }],
      ),
    ).toEqual([]);
  });

  test("a page release nearer another stored release is not taken by the selected one", () => {
    expect(
      match(
        [
          { name: "removed", date: "2026-06-01" },
          { name: "slipped", date: "2026-06-20" },
        ],
        [
          { name: "slipped later", date: "2026-06-25" },
          { name: "next year", date: "2027-06-01" },
        ],
      ),
    ).toEqual([{ from: "slipped", to: "slipped later" }]);
  });

  test("a release whose type or currency changed beside another change is not matched", () => {
    expect(
      match(
        [
          { name: "standard", date: "2026-06-15" },
          { name: "limited", date: "2026-06-15", type: "Limited" },
          { name: "yen", date: "2026-06-15", type: "Exclusive" },
        ],
        [
          { name: "standard slipped", date: "2026-07-15" },
          { name: "limited renamed", date: "2026-06-15", type: "Limited (Japan)" },
          { name: "dollars", date: "2026-06-15", type: "Exclusive", currency: "USD" },
        ],
      ),
    ).toEqual([{ from: "standard", to: "standard slipped" }]);
  });

  test("one changed release still moves to the one new release whatever changed", () => {
    expect(
      match(
        [{ name: "standard", date: "2026-06-15" }],
        [{ name: "dollars", date: "2027-01-01", type: "Exclusive", currency: "USD" }],
      ),
    ).toEqual([{ from: "standard", to: "dollars" }]);
  });
});
