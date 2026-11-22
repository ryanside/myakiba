import { expect, test } from "bun:test";
import { MAX_ADD_ROWS } from "@myakiba/contracts/add/constants";
import { draftReducer } from "./add-draft";

const empty = { rows: [], waiting: [] };
const withRows = (...itemIds: string[]) => draftReducer(empty, { type: "add", itemIds });

test("new rows come first, unticked, and a known Item is not added twice", () => {
  const state = draftReducer(withRows("a"), { type: "add", itemIds: ["b", "a", "b"] });
  expect(state.rows.map(({ itemId, selected }) => [itemId, selected])).toEqual([
    ["b", undefined],
    ["a", undefined],
  ]);
});

test("rows past the limit wait, oldest first, and join as rows leave", () => {
  const ids = Array.from({ length: MAX_ADD_ROWS }, (_, index) => `item-${index}`);
  let state = draftReducer(withRows(...ids), { type: "add", itemIds: ["late-1", "late-2"] });
  state = draftReducer(state, { type: "add", itemIds: ["late-1", "item-0", "late-3"] });
  expect(state.rows).toHaveLength(MAX_ADD_ROWS);
  expect(state.waiting).toEqual(["late-1", "late-2", "late-3"]);

  state = draftReducer(state, { type: "remove", itemIds: ["item-0", "item-1", "late-3"] });
  expect(state.rows.slice(0, 2).map(({ itemId }) => itemId)).toEqual(["late-1", "late-2"]);
  expect(state.rows).toHaveLength(MAX_ADD_ROWS);
  expect(state.waiting).toEqual([]);
});

test("edits merge into one row and selection changes only what it names", () => {
  let state = withRows("a", "b");
  state = draftReducer(state, { type: "edit", itemId: "a", overrides: { price: "1" } });
  state = draftReducer(state, { type: "edit", itemId: "a", overrides: { count: 2 } });
  state = draftReducer(state, { type: "select", itemId: "b", selected: false });
  expect(state.rows.map(({ overrides, selected }) => [overrides, selected])).toEqual([
    [{ price: "1", count: 2 }, undefined],
    [{}, false],
  ]);
  expect(
    draftReducer(state, { type: "select-all", selected: true }).rows.every((row) => row.selected),
  ).toBe(true);
});
