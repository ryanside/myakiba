import { expect, test } from "bun:test";
import type { ReleaseDate } from "@myakiba/contracts/shared/release-date";
import { orderDraft } from "./order-draft";

test("a draft of no sources is unpaid", () => {
  expect(orderDraft([]).paid).toBe(false);
});

const source = (releaseDate: ReleaseDate | null) => ({ ...orderDraft([]), releaseDate });

test("a draft takes the latest Release Date with its precision", () => {
  expect(
    orderDraft([
      source({ start: "2026-06-01", precision: "month" }),
      source({ start: "2026-06-15", precision: "day" }),
      source(null),
    ]).releaseDate,
  ).toEqual({ start: "2026-06-15", precision: "day" });
});

test("of two Release Dates on one day, a draft takes the less precise, which shows no day", () => {
  const juneFirst = { start: "2026-06-01", precision: "day" } as const;
  const june = { start: "2026-06-01", precision: "month" } as const;
  expect(orderDraft([source(juneFirst), source(june)]).releaseDate).toEqual(june);
  expect(orderDraft([source(june), source(juneFirst)]).releaseDate).toEqual(june);
});
