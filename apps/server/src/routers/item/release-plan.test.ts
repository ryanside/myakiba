import { describe, expect, test } from "bun:test";
import { buildReleasePlan } from "./release-plan";

const plan = (storedKeys: string[], pageKeys: string[]) =>
  buildReleasePlan({
    existing: storedKeys.map((key) => ({ id: `stored-${key}`, key })),
    page: pageKeys.map((key) => ({ id: `new-${key}`, key })),
  });

describe("buildReleasePlan", () => {
  test("the same releases need nothing, whatever their stored ids", () => {
    expect(plan(["a", "b"], ["b", "a"])).toEqual({
      kind: "none",
      staleReleaseIds: [],
      addedReleaseIds: [],
    });
  });

  test("only added releases need nothing", () => {
    expect(plan(["a"], ["a", "b"])).toEqual({
      kind: "none",
      staleReleaseIds: [],
      addedReleaseIds: ["new-b"],
    });
  });

  test("no releases before and none on the page need nothing", () => {
    expect(plan([], [])).toEqual({ kind: "none", staleReleaseIds: [], addedReleaseIds: [] });
  });

  test("one release replaced by one other remaps the selection", () => {
    expect(plan(["a", "b"], ["a", "c"])).toEqual({
      kind: "remap",
      staleReleaseIds: ["stored-b"],
      addedReleaseIds: ["new-c"],
      fromReleaseId: "stored-b",
      toReleaseId: "new-c",
    });
  });

  test("two releases replaced clears both", () => {
    expect(plan(["a", "b"], ["c", "d"])).toEqual({
      kind: "clear",
      staleReleaseIds: ["stored-a", "stored-b"],
      addedReleaseIds: ["new-c", "new-d"],
    });
  });

  test("one release replaced while another is added clears it", () => {
    expect(plan(["a", "b"], ["a", "c", "d"])).toEqual({
      kind: "clear",
      staleReleaseIds: ["stored-b"],
      addedReleaseIds: ["new-c", "new-d"],
    });
  });

  test("two releases replaced by one other clears both", () => {
    expect(plan(["a", "b", "c"], ["a", "d"])).toEqual({
      kind: "clear",
      staleReleaseIds: ["stored-b", "stored-c"],
      addedReleaseIds: ["new-d"],
    });
  });

  test("a removed release with nothing in its place clears it", () => {
    expect(plan(["a", "b"], ["a"])).toEqual({
      kind: "clear",
      staleReleaseIds: ["stored-b"],
      addedReleaseIds: [],
    });
  });

  test("every release gone clears them all", () => {
    expect(plan(["a"], [])).toEqual({
      kind: "clear",
      staleReleaseIds: ["stored-a"],
      addedReleaseIds: [],
    });
  });
});
