import { afterAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { $ } from "bun";
import config from "../../oxlint.config.ts";

const repoRoot = path.resolve(import.meta.dir, "../..");
const oxlint = path.join(repoRoot, "node_modules/.bin/oxlint");
const reactQuery: object = await import(
  path.join(repoRoot, "apps/web/node_modules/@tanstack/react-query")
);

// Hooks that read no server data: hydration state and the error boundary's reset.
const harmlessHooks = new Set(["useIsRestoring", "useQueryErrorResetBoundary"]);
const queryExports = Object.keys(reactQuery)
  .filter((name) => /^use|Observer$|Options$/.test(name) && !harmlessHooks.has(name))
  .toSorted();

type RestrictedPath = { name: string; importNames?: string[] };
const banOverrides = config.overrides
  .filter((override) => "no-restricted-imports" in (override.rules ?? {}))
  .map(({ files, excludeFiles, rules }) => ({
    files,
    excludeFiles,
    rules: { "no-restricted-imports": rules?.["no-restricted-imports"] },
  }));
const restricted = banOverrides
  .flatMap(({ rules }) => {
    const setting = rules?.["no-restricted-imports"];
    if (!Array.isArray(setting)) return [];
    const [, options] = setting as [string, { paths?: RestrictedPath[] }];
    return options.paths ?? [];
  })
  .filter((entry) => entry.name === "@tanstack/react-query")
  .flatMap((entry) => entry.importNames ?? []);

const project = await mkdtemp(path.join(tmpdir(), "hook-ban-"));
afterAll(() => rm(project, { recursive: true, force: true }));

type Diagnostic = { code: string; message: string; labels: { span: { line: number } }[] };

async function lint(file: string, source: string) {
  const fixture = path.join(project, file);
  await mkdir(path.dirname(fixture), { recursive: true });
  await Bun.write(fixture, source);
  await Bun.write(
    path.join(project, ".oxlintrc.json"),
    JSON.stringify({ categories: { correctness: "off" }, plugins: [], overrides: banOverrides }),
  );
  const run = await $`${oxlint} -c .oxlintrc.json --disable-nested-config -f json ${file}`
    .cwd(project)
    .nothrow()
    .quiet();
  const { diagnostics }: { diagnostics: Diagnostic[] } = run.json();
  return diagnostics.filter((diagnostic) => diagnostic.code === "eslint(no-restricted-imports)");
}

async function banHits(file: string) {
  const diagnostics = await lint(
    file,
    `import { ${queryExports.join(", ")} } from "@tanstack/react-query";\nexport const used = [${queryExports.join(", ")}];\n`,
  );
  return diagnostics.map((diagnostic) => /'(\w+)' import/.exec(diagnostic.message)?.[1]).toSorted();
}

const imports = {
  hook: 'import { useQuery } from "@tanstack/react-query";',
  dbClient: 'import { db } from "@myakiba/db/client";',
  dbPackagePath: 'import { item } from "@myakiba/db/src/schema/figure";',
  dbRelativePath: 'import { client } from "../../../../../packages/db/src/client";',
  testFile: 'import { seed } from "./seed.test";',
  testHelper: 'import { drag } from "../../../test/kanban-drag";',
};
type ImportCase = keyof typeof imports;

async function flagged(file: string) {
  const cases = Object.keys(imports) as ImportCase[];
  const diagnostics = await lint(file, `${cases.map((name) => imports[name]).join("\n")}\n`);
  const lines = new Set(diagnostics.map((diagnostic) => diagnostic.labels[0]?.span.line));
  return cases.filter((_name, index) => lines.has(index + 1));
}

test("the hook ban names every react-query export that reads or writes server data", () => {
  expect([...new Set(restricted)].toSorted()).toEqual(queryExports);
});

test("a screen that imports any of them fails the lint, and the data folder does not", async () => {
  expect(await banHits("apps/web/src/components/screen.tsx")).toEqual(queryExports);
  expect(await banHits("apps/web/src/data/resources/reads.ts")).toEqual([]);
});

test("the hook ban keeps the db-client lock on every web file", async () => {
  const dbLock: ImportCase[] = ["dbClient", "dbPackagePath", "dbRelativePath"];
  expect({
    screen: await flagged("apps/web/src/components/screen.tsx"),
    webTest: await flagged("apps/web/src/components/screen.test.tsx"),
    orderTest: await flagged("apps/web/src/components/orders/order-submit.test.tsx"),
    data: await flagged("apps/web/src/data/resources/reads.ts"),
    scraper: await flagged("apps/web/src/components/sync/sync-launcher.tsx"),
    replayedTest: await flagged("apps/web/src/hooks/use-wishlist.test.tsx"),
  }).toEqual({
    screen: ["hook", ...dbLock, "testFile", "testHelper"],
    webTest: ["hook", ...dbLock],
    orderTest: ["hook", ...dbLock, "testFile", "testHelper"],
    data: [...dbLock, "testFile", "testHelper"],
    scraper: [...dbLock, "testFile", "testHelper"],
    replayedTest: dbLock,
  });
});

type Restriction = { name?: string; importNames?: string[]; regex?: string };
type RuleOptions = { paths?: Restriction[]; patterns?: Restriction[] };

function restrictionsAt(file: string, overrides: typeof config.overrides) {
  const matches = (globs: string[] | undefined) =>
    (globs ?? []).some((glob) => new Bun.Glob(glob).match(file));
  let options: RuleOptions = {};
  for (const override of overrides) {
    const setting = override.rules?.["no-restricted-imports"];
    if (!Array.isArray(setting) || !matches(override.files) || matches(override.excludeFiles))
      continue;
    options = (setting as [string, RuleOptions])[1];
  }
  return new Set([
    ...(options.paths ?? []).flatMap(({ name, importNames }) =>
      importNames ? importNames.map((importName) => `${name} ${importName}`) : [`${name}`],
    ),
    ...(options.patterns ?? []).map(({ regex }) => `pattern ${regex}`),
  ]);
}

test("the hook ban only adds restrictions to what the other overrides give each web file", async () => {
  const banBlocks = new Set(
    config.overrides.filter(({ rules }) => {
      const setting = rules?.["no-restricted-imports"];
      return (
        Array.isArray(setting) &&
        ((setting as [string, RuleOptions])[1].paths ?? []).some(
          ({ name }) => name === "@tanstack/react-query",
        )
      );
    }),
  );
  const withoutBan = config.overrides.filter((override) => !banBlocks.has(override));
  const tracked = await $`git ls-files apps/web/src`.cwd(repoRoot).text();
  const files = tracked.split("\n").filter((file) => /\.[cm]?[jt]sx?$/.test(file));
  const loosened = files.flatMap((file) => {
    const withBan = restrictionsAt(file, config.overrides);
    return [...restrictionsAt(file, withoutBan)]
      .filter((restriction) => !withBan.has(restriction))
      .map((restriction) => `${file}: ${restriction}`);
  });

  expect(files.length).toBeGreaterThan(100);
  expect(loosened).toEqual([]);
});
