import { describe, expect, test } from "bun:test";
import { releaseKey, storedPercentage } from "./item-details";

const release = {
  date: "2018-11-15",
  type: "Standard (Japan)",
  price: 1_350_000,
  priceCurrency: "JPY",
  barcode: "4582292601715",
};

describe("releaseKey is a release's identity within its Item", () => {
  test("two releases with equal content have equal keys", () => {
    expect(releaseKey({ ...release })).toBe(releaseKey(release));
  });

  test.each([
    ["date", { date: "2018-12-20" }],
    ["type", { type: "Limited (Japan)" }],
    ["price", { price: 1_480_000 }],
    ["priceCurrency", { priceCurrency: "USD" }],
    ["barcode", { barcode: "4582292609999" }],
  ] as const)("a different %s is a different release", (_field, change) => {
    expect(releaseKey({ ...release, ...change })).not.toBe(releaseKey(release));
  });
});

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
])("storedPercentage(%s) matches Postgres numeric rounding", (input, expected) => {
  expect(storedPercentage(input)).toBe(expected);
});
