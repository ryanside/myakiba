import { expect, test } from "bun:test";
import { addSearchSchema } from "./add-search";

test("reads every preset a link can carry", () => {
  expect(
    addSearchSchema.parse({
      to: "order:abc12345",
      item: "abc12345",
      mfc: "98777",
      q: " miku ",
      from: "mfc",
    }),
  ).toEqual({ to: "order:abc12345", item: "abc12345", mfc: 98_777, q: "miku", from: "mfc" });
});

test.each([{ to: "elsewhere" }, { to: "order:NOPE" }, { item: "x" }, { mfc: "-1" }, { from: "x" }])(
  "refuses %j",
  (search) => {
    expect(addSearchSchema.safeParse(search).success).toBe(false);
  },
);
