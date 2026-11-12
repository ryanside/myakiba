import { expect, test } from "bun:test";
import path from "node:path";

/** The kernel defines `commitFirst`, and its type test pins that the body's scope has none. */
const KERNEL = new Set([
  "apps/server/src/domain/kernel.ts",
  "apps/server/src/domain/operations.ts",
  "apps/server/src/domain/kernel.type-test.ts",
]);
const RESERVATION = "apps/server/src/lib/mfc-item-ingest.ts";

const PRODUCTION = /^(?:apps|packages)\/.+\.[cm]?[jt]sx?$/u;
/** What `testImports` in oxlint.config.ts bans production from importing; it may import the rest. */
const NOT_PRODUCTION = /(?:\.test\.[cm]?[jt]sx?$|(?:^|\/)test\/)/u;
/** Any mention: a call, a property read by name or by string key, or a destructured binding. */
const MENTION = /\bcommitFirst\b/gu;
/** A call by property access, as the reservation makes it. */
const CALL = /\.commitFirst\(/gu;

const isProduction = (file: string) => PRODUCTION.test(file) && !NOT_PRODUCTION.test(file);

function mentions(source: string): number[] {
  return [...source.matchAll(MENTION)].map(
    (match) => source.slice(0, match.index).split("\n").length,
  );
}

test.each([
  ["scope.commitFirst((tx) => tx.insert(user))", [1]],
  ['const write = scope["commitFirst"];', [1]],
  ["const { commitFirst } = scope;\ncommitFirst(write);", [1, 2]],
  ["const firstCommit = 1;", []],
])("finds every mention in %s", (source, lines) => {
  expect(mentions(source)).toEqual(lines);
});

test.each([
  ["apps/server/src/lib/mfc-item-ingest.ts", true],
  ["apps/server/src/domain/kernel.test.ts", false],
  ["apps/server/src/domain/kernel.type-test.ts", true],
  ["apps/web/e2e/sentence/cases.ts", true],
  ["apps/server/src/lib/picture.e2e.ts", true],
  ["apps/web/e2e/add-sentence.e2e.test.ts", false],
  ["apps/server/test/database.ts", false],
  ["scripts/commit-first.test.ts", false],
])("%s is production: %p", (file, production) => {
  expect(isProduction(file)).toBe(production);
});

test(`only ${RESERVATION} calls commitFirst, and only once`, async () => {
  const root = path.resolve(import.meta.dir, "..");
  const listed = Bun.spawnSync(
    ["git", "ls-files", "--cached", "--others", "--exclude-standard", "apps", "packages"],
    { cwd: root },
  );
  expect(listed.exitCode).toBe(0);
  const files = listed.stdout.toString().split("\n").filter(isProduction);
  expect(files).toContain(RESERVATION);

  const strays: string[] = [];
  let reservations = 0;
  for (const file of files) {
    if (KERNEL.has(file)) continue;
    const source = Bun.file(path.join(root, file));
    if (!(await source.exists())) continue;
    const text = await source.text();
    if (file === RESERVATION) reservations = [...text.matchAll(CALL)].length;
    else strays.push(...mentions(text).map((line) => `${file}:${line}`));
  }

  expect(strays).toEqual([]);
  expect(reservations).toBe(1);
});
