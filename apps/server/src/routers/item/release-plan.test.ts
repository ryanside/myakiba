import { describe, expect, test } from "bun:test";
import { buildReleasePlan } from "./release-plan";

const plan = (existingReleaseIds: string[], pageReleaseIds: string[]) =>
  buildReleasePlan({ existingReleaseIds, pageReleaseIds });

describe("buildReleasePlan", () => {
  test("the same releases need nothing", () => {
    expect(plan(["a", "b"], ["b", "a"])).toEqual({ kind: "none", staleReleaseIds: [] });
  });

  test("only added releases need nothing", () => {
    expect(plan(["a"], ["a", "b"])).toEqual({ kind: "none", staleReleaseIds: [] });
  });

  test("no releases before and none on the page need nothing", () => {
    expect(plan([], [])).toEqual({ kind: "none", staleReleaseIds: [] });
  });

  test("one release replaced by one other remaps the selection", () => {
    expect(plan(["a", "b"], ["a", "c"])).toEqual({
      kind: "remap",
      staleReleaseIds: ["b"],
      fromReleaseId: "b",
      toReleaseId: "c",
    });
  });

  test("two releases replaced clears both", () => {
    expect(plan(["a", "b"], ["c", "d"])).toEqual({ kind: "clear", staleReleaseIds: ["a", "b"] });
  });

  test("one release replaced while another is added clears it", () => {
    expect(plan(["a", "b"], ["a", "c", "d"])).toEqual({ kind: "clear", staleReleaseIds: ["b"] });
  });

  test("a removed release with nothing in its place clears it", () => {
    expect(plan(["a", "b"], ["a"])).toEqual({ kind: "clear", staleReleaseIds: ["b"] });
  });

  test("every release gone clears them all", () => {
    expect(plan(["a"], [])).toEqual({ kind: "clear", staleReleaseIds: ["a"] });
  });
});
