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

test("replay name matching excludes skipped and pending registrations", () => {
  for (const modifier of ["skip", "todo", "skipIf(false)", "todoIf(false)"]) {
    const source = `
      test.${modifier}("pinned", () => {});
      it.${modifier}("pending", () => {});
      describe.${modifier}("suite", () => { test("nested", () => {}); });
      test.${modifier}.each(["row"])("generated %s", () => {});
    `;
    expect([...namesIn("fixture.ts", source)]).toEqual([]);
  }
});

test("replay name matching excludes conditional registrations and blocks", () => {
  const source = `
    test.if(true)("conditional test", () => { test("nested test", () => {}); });
    describe.if(true)("conditional suite", () => { test("nested", () => {}); });
    if (true) { test("if branch", () => {}); } else { test("else branch", () => {}); }
    true && test("logical branch", () => {});
    true ? test("then branch", () => {}) : test("other branch", () => {});
    switch ("case") { case "case": test("switch branch", () => {}); }
    while (false) { test("while branch", () => {}); }
    do { test("do branch", () => {}); } while (false);
    for (let i = 0; i < 1; i++) { test("for branch", () => {}); }
    for (const key in {}) { test("for-in branch", () => {}); }
    try { test("try branch", () => {}); } catch { test("catch branch", () => {}); }
  `;
  expect([...namesIn("fixture.ts", source)]).toEqual([]);
});

test("replay name matching resolves spread arguments to each", () => {
  const source = `
    const rows = [["one", 1], ["two", 2]];
    const parameters = [rows];
    test.each(...parameters)("%s %d", () => {});
  `;
  expect([...namesIn("fixture.ts", source)]).toEqual(["one 1", "two 2"]);
  expect(() => namesIn("fixture.ts", 'test.each(...unknownArguments)("case", () => {});')).toThrow(
    "cannot resolve test.each spread arguments statically",
  );
});

test("pinned replay harnesses and head coverage explain their historical revisions", async () => {
  const {
    test: replays,
  }: {
    test: {
      fix: string;
      test: string;
      testAt?: string;
      reason?: string;
      head?: { test: string; reason?: string }[];
    }[];
  } = await Bun.file(path.join(import.meta.dir, "replays.json")).json();
  const missing = replays.flatMap((entry) => [
    ...(entry.testAt && !entry.reason?.trim()
      ? [`${entry.fix} ${entry.test}: harness reason`]
      : []),
    ...(entry.head?.some((group) => group.reason === entry.reason)
      ? [`${entry.fix} ${entry.test}: duplicate reason`]
      : []),
    ...(entry.head ?? [])
      .filter((group) => !group.reason?.trim())
      .map((group) => `${entry.fix} ${group.test}: head reason`),
  ]);
  expect(missing).toEqual([]);
});
