import { expect, test } from "bun:test";
import { storedPercentage } from "./refresh-item";

test.each([
  [null, null],
  [-1.005, -1.01],
  [-1.004, -1],
  [-0, 0],
  [-0.001, 0],
  [1.005, 1.01],
  [1.004, 1],
  [1.125, 1.13],
  [-1.125, -1.13],
  [9.995, 10],
  [-9.995, -10],
  [1e-7, 0],
  [-1e-7, 0],
  [5e-3, 0.01],
  [-5e-3, -0.01],
  [1e21, 1e21],
  [-1e21, -1e21],
])("storedPercentage(%s) matches Postgres numeric rounding", (input, expected) => {
  expect(storedPercentage(input)).toBe(expected);
});
