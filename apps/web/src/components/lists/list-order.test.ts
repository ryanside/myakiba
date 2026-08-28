import { describe, expect, test } from "bun:test";
import { moveSortableSelection } from "./list-order";

const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }] as const;

describe("moveSortableSelection", () => {
  test("returns null when the active item is missing", () => {
    expect(moveSortableSelection(items, "missing", "b", new Set())).toBeNull();
  });

  test("returns null when the target item is missing", () => {
    expect(moveSortableSelection(items, "a", "missing", new Set())).toBeNull();
  });

  test("returns null for no-op drops", () => {
    expect(moveSortableSelection(items, "a", "a", new Set())).toBeNull();
    expect(moveSortableSelection(items, "a", "b", new Set(["a", "b"]))).toBeNull();
  });

  test("moves one item relative to the target", () => {
    expect(moveSortableSelection(items, "a", "c", new Set())).toEqual({
      items: [{ id: "b" }, { id: "c" }, { id: "a" }, { id: "d" }],
      intent: { movedIds: ["a"], anchorId: "c", placement: "after" },
    });
  });

  test("keeps selected items in their saved order", () => {
    expect(moveSortableSelection(items, "b", "d", new Set(["a", "b"]))).toEqual({
      items: [{ id: "c" }, { id: "d" }, { id: "a" }, { id: "b" }],
      intent: { movedIds: ["a", "b"], anchorId: "d", placement: "after" },
    });
  });
});
