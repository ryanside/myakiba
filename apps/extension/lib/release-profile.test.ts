import { describe, expect, test } from "bun:test";
import { PRODUCTION_EXTENSION_ORIGINS } from "@myakiba/env/extension";
import { assertReleaseOrigins } from "./release-profile";

const LOOPBACK = { ...PRODUCTION_EXTENSION_ORIGINS, WXT_WEB_ORIGIN: "http://localhost:1" };

describe("assertReleaseOrigins", () => {
  test("a production build with the production origins passes", () => {
    expect(() =>
      assertReleaseOrigins({ mode: "production", command: "build" }, PRODUCTION_EXTENSION_ORIGINS),
    ).not.toThrow();
  });

  test.each(["production", "staging"])("a %s build with another origin fails", (mode) => {
    expect(() => assertReleaseOrigins({ mode, command: "build" }, LOOPBACK)).toThrow(
      "WXT_WEB_ORIGIN",
    );
  });

  test.each([
    ["the e2e build", { mode: "e2e", command: "build" }],
    ["dev", { mode: "development", command: "serve" }],
  ] as const)("%s may use other origins", (_, build) => {
    expect(() => assertReleaseOrigins(build, LOOPBACK)).not.toThrow();
  });
});
