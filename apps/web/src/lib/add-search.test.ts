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

const link = {
  to: "order:abc12345",
  item: "abc12345",
  mfc: "98777",
  q: "miku",
  from: "mfc",
  returnTo: "/collection",
};

test.each([
  ["to", "elsewhere"],
  ["to", "order:NOPE"],
  ["item", "verify-item-1"],
  ["item", "x"],
  ["item", ["abc12345", "def67890"]],
  ["mfc", "-1"],
  ["mfc", "abc"],
  ["q", "a".repeat(201)],
  ["from", "x"],
])("ignores the malformed %s %j and keeps the rest of the link", (key, value) => {
  expect(addSearchSchema.parse({ ...link, [key]: value })).toEqual({
    ...addSearchSchema.parse(link),
    [key]: undefined,
  });
});

test("keeps a path on this site to return to", () => {
  expect(addSearchSchema.parse({ returnTo: "/collection?page=2" }).returnTo).toBe(
    "/collection?page=2",
  );
});

test.each([
  "https://evil.example",
  "//evil.example",
  "/\\evil.example",
  "\\\\evil.example",
  "/\t/evil.example",
  "data:text/html,evil",
  `/${"a".repeat(2048)}`,
  5,
])("drops the return target %j and keeps the rest of the link", (returnTo) => {
  expect(addSearchSchema.parse({ to: "collection", returnTo })).toEqual({
    to: "collection",
    returnTo: undefined,
  });
});
