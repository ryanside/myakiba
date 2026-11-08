import { expect, test } from "bun:test";
import { MAX_ADD_ROWS } from "@myakiba/contracts/add/constants";
import { draftReducer } from "./add-draft";

const empty = { rows: [], full: false };
const withRows = (...itemIds: string[]) => draftReducer(empty, { type: "add", itemIds });

test("new rows come first, selected, and a known Item is not added twice", () => {
  const state = draftReducer(withRows("a"), { type: "add", itemIds: ["b", "a", "b"] });
  expect(state.rows.map(({ itemId, selected }) => [itemId, selected])).toEqual([
    ["b", true],
    ["a", true],
  ]);
});

test("a row past the limit is left out and the draft says it is full", () => {
  const ids = Array.from({ length: MAX_ADD_ROWS }, (_, index) => `item-${index}`);
  const full = draftReducer(withRows(...ids), { type: "add", itemIds: ["one-more"] });
  expect(full.rows).toHaveLength(MAX_ADD_ROWS);
  expect(full.rows.some(({ itemId }) => itemId === "one-more")).toBe(false);
  expect(full.full).toBe(true);
  expect(draftReducer(full, { type: "remove", itemIds: ["item-0"] }).full).toBe(false);
});

test("edits merge into one row and selection changes only what it names", () => {
  let state = withRows("a", "b");
  state = draftReducer(state, { type: "edit", itemId: "a", overrides: { price: "1" } });
  state = draftReducer(state, { type: "edit", itemId: "a", overrides: { count: 2 } });
  state = draftReducer(state, { type: "select", itemId: "b", selected: false });
  expect(state.rows.map(({ overrides, selected }) => [overrides, selected])).toEqual([
    [{ price: "1", count: 2 }, true],
    [{}, false],
  ]);
  expect(
    draftReducer(state, { type: "select-all", selected: true }).rows.every((row) => row.selected),
  ).toBe(true);
});
