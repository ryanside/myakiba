import { expect, test } from "bun:test";
import path from "node:path";

test("Docker contexts exclude test-results.xml at every depth", async () => {
  const patterns = await Bun.file(path.join(import.meta.dir, "../.dockerignore")).text();
  expect(patterns.split(/\r?\n/u)).toContain("**/test-results.xml");
});

test("Docker contexts exclude report namespace directories at every depth", async () => {
  const patterns = await Bun.file(path.join(import.meta.dir, "../.dockerignore")).text();
  expect(patterns.split(/\r?\n/u)).toContain("**/.test-results");
});
