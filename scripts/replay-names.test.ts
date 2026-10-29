import { expect, test } from "bun:test";
import path from "node:path";
import { namesIn } from "./replay-names";

test("replay name matching uses full Bun names, including generated cases", () => {
  const source = `describe.each(["outer", "other"])("%s", group => {
    for (const kind of ["one", "two"]) test.each([["case", 1]])(\`\${kind} %s %d\`, () => {});
  });`;
  expect([...namesIn("fixture.ts", source)]).toEqual([
    "outer > one case 1",
    "outer > two case 1",
    "other > one case 1",
    "other > two case 1",
  ]);
  expect(namesIn("fixture.ts", source.replace("%s %d", "renamed"))).not.toContain(
    "outer > one case 1",
  );
  expect(namesIn("fixture.ts", source.replace('["one", "two"]', '["two"]'))).not.toContain(
    "outer > one case 1",
  );
  expect(namesIn("fixture.ts", '// test("removed", () => {})')).not.toContain("removed");
});

test("pinned replay tests still exist in the current test files", async () => {
  const {
    test: replays,
  }: {
    test: {
      test: string;
      testAt?: string;
      fixed: string[];
      head?: { test: string; fixed: string[]; reason: string }[];
    }[];
  } = await Bun.file(path.join(import.meta.dir, "replays.json")).json();
  const current = replays
    .filter((entry) => entry.testAt)
    .flatMap((entry) => entry.head ?? [{ test: entry.test, fixed: entry.fixed }]);
  const missing: string[] = [];
  for (const file of new Set(current.map((entry) => entry.test))) {
    const names = namesIn(file, await Bun.file(path.resolve(import.meta.dir, "..", file)).text());
    for (const coverage of current.filter((candidate) => candidate.test === file))
      for (const name of coverage.fixed) if (!names.has(name)) missing.push(`${file}: ${name}`);
  }
  expect(missing).toEqual([]);
});
