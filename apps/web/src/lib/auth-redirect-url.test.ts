import { expect, test } from "bun:test";
import { isInternalPath, resolvePostAuthRedirect } from "./auth-redirect-url";

test.each(["/", "/collection", "/collection?ids=a,b&page=2#row", "/item/98777", "/a//b"])(
  "%s is a path on this site",
  (path) => {
    expect(isInternalPath(path)).toBe(true);
    expect(resolvePostAuthRedirect(path)).toBe(path);
  },
);

test.each([
  "https://evil.example",
  "//evil.example",
  "///evil.example",
  "/\\evil.example",
  "\\\\evil.example",
  "\\/evil.example",
  "/\t/evil.example",
  "/\n/evil.example",
  "data:text/html,evil",
  "collection",
  "",
])("%j would leave this site, or is not a path", (path) => {
  expect(isInternalPath(path)).toBe(false);
  expect(resolvePostAuthRedirect(path)).toBe("/dashboard");
});
