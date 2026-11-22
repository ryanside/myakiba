import { expect, test } from "bun:test";
import { planPositionOrderRestore } from "./position-order";

const rows = (...positions: readonly [string, number][]) =>
  positions.map(([id, position]) => ({ id, position }));

const restore = (current: ReturnType<typeof rows>, restoredPositions: readonly number[]) => {
  const { placed, updates } = planPositionOrderRestore(
    current,
    restoredPositions.map((position, index) => ({ key: index, position })),
  );
  return {
    positions: placed
      .toSorted((left, right) => left.restored.key - right.restored.key)
      .map(({ position }) => position),
    updates,
  };
};

test("a restored row takes back its free position and moves no other row", () => {
  expect(restore(rows(["a", 0], ["c", 2], ["d", 3]), [1])).toEqual({
    positions: [1],
    updates: [],
  });
});

test("a restored row goes ahead of a row that took its position, which moves up with the rows behind it", () => {
  expect(restore(rows(["a", 0], ["added", 1], ["later", 2]), [1])).toEqual({
    positions: [1],
    updates: [
      { id: "added", position: 2 },
      { id: "later", position: 3 },
    ],
  });
});

test("a row that took a restored position stays ahead of a restored row that held a later one", () => {
  expect(restore(rows(["a", 0], ["added", 1]), [1, 2])).toEqual({
    positions: [1, 3],
    updates: [{ id: "added", position: 2 }],
  });
});

test("tied rows that a restored row does not reach keep their positions", () => {
  expect(restore(rows(["a", 0], ["b", 0], ["c", 5], ["d", 5]), [2])).toEqual({
    positions: [2],
    updates: [],
  });
});
