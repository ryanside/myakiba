import { expect, test } from "bun:test";
import { MAX_ADD_ROWS } from "@myakiba/contracts/add/constants";
import { draftReducer as reduce } from "./add-draft";
import type { DraftAction } from "./add-draft";

const AT = 7;
const draftReducer = (state: Parameters<typeof reduce>[0], action: DraftAction) =>
  reduce(state, { ...action, at: AT });
const empty = { rows: [], waiting: [], newestArrival: 0, kept: new Map() };
const withRows = (...itemIds: string[]) => draftReducer(empty, { type: "add", itemIds });

test("new rows come first, waiting for a read since they arrived, and a known Item is not added twice", () => {
  const state = draftReducer(withRows("a"), { type: "add", itemIds: ["b", "a", "b"] });
  expect(state.rows).toEqual([
    { itemId: "b", overrides: {}, selected: null },
    { itemId: "a", overrides: {}, selected: null },
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
    [{ price: "1", count: 2 }, null],
    [{}, false],
  ]);
  expect(
    draftReducer(state, { type: "select-all", selected: true }).rows.map((row) => row.selected),
  ).toEqual([null, true]);
});
