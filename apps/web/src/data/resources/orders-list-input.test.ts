import { expect, test } from "bun:test";
import { ordersListInput } from "./orders";

test("a Release Date month becomes that month's dates on the viewer's day", () => {
  expect(ordersListInput({ releaseMonth: "this", status: ["Ordered"] }, "2026-11-28")).toEqual({
    status: ["Ordered"],
    releaseDateStart: "2026-11-01",
    releaseDateEnd: "2026-11-30",
  });
  expect(ordersListInput({ releaseMonth: "next" }, "2026-12-31")).toEqual({
    releaseDateStart: "2027-01-01",
    releaseDateEnd: "2027-01-31",
  });
});

test("the month moves with the viewer's day, so the same URL reads the new month", () => {
  const search = { releaseMonth: "this" } as const;

  expect(ordersListInput(search, "2026-11-30").releaseDateStart).toBe("2026-11-01");
  expect(ordersListInput(search, "2026-12-01").releaseDateStart).toBe("2026-12-01");
});

test("the month wins over dates typed into the range", () => {
  expect(
    ordersListInput(
      { releaseMonth: "this", releaseDateStart: "2020-01-01", releaseDateEnd: "2020-01-31" },
      "2026-11-28",
    ),
  ).toEqual({ releaseDateStart: "2026-11-01", releaseDateEnd: "2026-11-30" });
});

test("without a month the filters pass through as they are", () => {
  const filters = { releaseDateStart: "2026-01-01", shop: ["AmiAmi"] };

  expect(ordersListInput(filters, "2026-11-28")).toEqual(filters);
});
