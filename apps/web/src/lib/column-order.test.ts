import { expect, test } from "bun:test";
import { withNewColumns } from "./column-order";

const defaults = ["select", "title", "status", "paid", "actions"];

test("a saved order from before a column existed gets it where the default order has it", () => {
  expect(withNewColumns(["select", "title", "status", "actions"], defaults)).toEqual(defaults);
});

test("a reordered saved order keeps its order and gets the new column after its default neighbor", () => {
  expect(withNewColumns(["select", "status", "title", "actions"], defaults)).toEqual([
    "select",
    "status",
    "paid",
    "title",
    "actions",
  ]);
});

test("a saved order that already names every column is unchanged", () => {
  const saved = ["actions", "paid", "status", "title", "select"];
  expect(withNewColumns(saved, defaults)).toEqual(saved);
});

test("a new first column goes first", () => {
  expect(withNewColumns(["title", "actions"], ["select", "title", "actions"])).toEqual([
    "select",
    "title",
    "actions",
  ]);
});
