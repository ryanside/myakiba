import { $ } from "bun";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

type TestReplay = {
  fix: string;
  bug: string;
  test: string;
  fixed: string[];
};

type LintReplay = {
  fix: string;
  bug: string;
  rule: string;
  atParent: string[];
  atFix: string[];
};

type LintRule = string | [string, ...unknown[]];
type LintConfig = {
  ignorePatterns: string[];
  jsPlugins: { name: string; specifier: string }[];
  rules: Record<string, LintRule>;
  overrides: { files: string[]; rules: Record<string, LintRule> }[];
};

type TestRun = {
  exitCode: number;
  passed: string[];
  failed: string[];
  skipped: string[];
  errorOutsideTests: boolean;
  output: string;
};

const root = path.resolve(import.meta.dir, "..");
const {
  test: testReplays = [],
  lint: lintReplays = [],
}: { test?: TestReplay[]; lint?: LintReplay[] } = await Bun.file(
  path.join(import.meta.dir, "replays.json"),
).json();
const lintMode = process.argv.includes("--lint");
if ((lintMode ? lintReplays : testReplays).length === 0) {
  console.error(`FAIL  scripts/replays.json lists no ${lintMode ? "lint " : ""}replay`);
  process.exit(1);
}
const filters = process.argv.slice(2).filter((arg) => arg !== "--lint");
const matches = (replay: TestReplay | LintReplay, filter: string) =>
  replay.fix.startsWith(filter) || ("rule" in replay ? replay.rule : replay.test).includes(filter);
const unmatched = filters.filter(
  (filter) => !(lintMode ? lintReplays : testReplays).some((replay) => matches(replay, filter)),
);
if (unmatched.length > 0) {
  console.error(`FAIL  no replay matches ${unmatched.join(" ")}`);
  process.exit(1);
}
const pick = <Replay extends TestReplay | LintReplay>(list: Replay[]) =>
  list.filter(
    (replay) => filters.length === 0 || filters.some((filter) => matches(replay, filter)),
  );
const selected = lintMode ? [] : pick(testReplays);
const selectedLint = lintMode ? pick(lintReplays) : [];

// bun test prints passing tests only when AGENT, CLAUDECODE and REPL_ID are unset.
$.env({ ...process.env, AGENT: undefined, CLAUDECODE: undefined, REPL_ID: undefined, HUSKY: "0" });

const readPackage = (dir: string) => Bun.file(path.join(dir, "package.json")).json();

async function packageDirOf(file: string) {
  let dir = path.dirname(file);
  while (!(await Bun.file(path.join(root, dir, "package.json")).exists())) dir = path.dirname(dir);
  return dir;
}

async function installedVersion(packageDir: string, dependency: string) {
  for (const dir of [path.join(root, packageDir), root]) {
    const manifest = Bun.file(path.join(dir, "node_modules", dependency, "package.json"));
    if (await manifest.exists()) {
      const { version }: { version: string } = await manifest.json();
      return version;
    }
  }
  throw new Error(`${dependency} is not installed in this checkout. Run bun install.`);
}

async function runTest(checkout: string, testFile: string): Promise<TestRun> {
  const packageDir = await packageDirOf(testFile);
  const { scripts } = await readPackage(path.join(root, packageDir));
  const { exitCode, stdout, stderr } =
    await $`sh -c ${`${scripts.test} "$@"`} sh ${`./${path.relative(packageDir, testFile)}`}`
      .cwd(path.join(checkout, packageDir))
      .nothrow()
      .quiet();
  const output = `${stdout}${stderr}`;
  const results = [...output.matchAll(/^\((pass|fail|skip|todo)\) (.+?)(?: \[[\d.]+m?s\])?$/gm)];
  const named = (result: string) => [
    ...new Set(results.filter((match) => match[1] === result).map((match) => match[2] ?? "")),
  ];
  const failed = named("fail");
  return {
    exitCode,
    passed: named("pass").filter((name) => !failed.includes(name)),
    failed,
    skipped: [...named("skip"), ...named("todo")],
    errorOutsideTests: output.includes("# Unhandled error between tests"),
    output,
  };
}

async function changedLines(fix: string) {
  const diff = await $`git diff -U0 --no-renames ${`${fix}^`} ${fix}`.cwd(root).text();
  const sides = { atParent: new Map<string, Set<number>>(), atFix: new Map<string, Set<number>>() };
  const add = (
    side: Map<string, Set<number>>,
    file: string | undefined,
    start: string | undefined,
    count = "1",
  ) => {
    if (file === undefined) return;
    const changed = side.get(file) ?? new Set<number>();
    for (let offset = 0; offset < Number(count); offset++) changed.add(Number(start) + offset);
    side.set(file, changed);
  };
  let parentFile: string | undefined;
  let fixFile: string | undefined;
  let inHeader = false;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      parentFile = undefined;
      fixFile = undefined;
      inHeader = true;
      continue;
    }
    const header = inHeader && /^(---|\+\+\+) (?:[ab]\/(.+)|\/dev\/null)$/.exec(line);
    if (header && header[1] === "---") parentFile = header[2];
    if (header && header[1] === "+++") fixFile = header[2];
    if (header) continue;
    const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!hunk) continue;
    inHeader = false;
    add(sides.atParent, parentFile, hunk[1], hunk[2]);
    add(sides.atFix, fixFile, hunk[3], hunk[4]);
  }
  return sides;
}

async function lintHits(checkout: string, rule: string, lines: Map<string, Set<number>>) {
  const { default: head }: { default: LintConfig } = await import(
    path.join(root, "oxlint.config.ts")
  );
  const [, prefix, name] = /^(.+)\((.+)\)$/.exec(rule) ?? [];
  const key = prefix === "eslint" ? name : `${prefix}/${name}`;
  const ruleSetting = head.rules[key];
  if (ruleSetting === undefined) throw new Error(`${key} is not configured in oxlint.config.ts.`);
  const config = {
    plugins: [],
    categories: { correctness: "off" },
    ignorePatterns: head.ignorePatterns,
    jsPlugins: head.jsPlugins.map((plugin) => ({
      ...plugin,
      specifier: path.resolve(root, plugin.specifier),
    })),
    rules: { [key]: ruleSetting },
    overrides: head.overrides
      .filter((override) => key in override.rules)
      .map((override) => ({ files: override.files, rules: { [key]: override.rules[key] } })),
  };
  await Bun.write(path.join(checkout, ".oxlint-replay.json"), JSON.stringify(config));
  const files = [...lines.keys()].filter((file) => /\.[cm]?[jt]sx?$/.test(file));
  if (files.length === 0) return [];
  const oxlint = path.join(root, "node_modules/.bin/oxlint");
  const lint = await $`${oxlint} -c .oxlint-replay.json --disable-nested-config -f json ${files}`
    .cwd(checkout)
    .nothrow()
    .quiet();
  if (!lint.text().startsWith("{")) throw new Error(lint.text());
  const {
    diagnostics,
  }: {
    diagnostics: {
      code?: string;
      message: string;
      filename: string;
      labels: { span: { line: number; column: number } }[];
    }[];
  } = lint.json();
  const unexpected = diagnostics.filter((diagnostic) => diagnostic.code !== rule);
  if (unexpected.length > 0)
    throw new Error(
      `oxlint reported more than ${rule} in ${checkout}:\n${unexpected.map(({ filename, message }) => `${filename}: ${message}`).join("\n")}`,
    );
  return diagnostics
    .map(({ filename, labels }) => ({ filename, span: labels[0]?.span ?? { line: 0, column: 0 } }))
    .filter(({ filename, span }) => lines.get(filename)?.has(span.line))
    .map(({ filename, span }) => `${filename}:${span.line}:${span.column}`)
    .toSorted();
}

const tail = (output: string) =>
  output
    .trimEnd()
    .split("\n")
    .slice(-20)
    .map((line) => `      ${line}`)
    .join("\n");

let mismatches = 0;
const report = (pass: boolean, label: string, details: string[] = []) => {
  if (!pass) mismatches++;
  console.log([`${pass ? "PASS" : "FAIL"}  ${label}`, ...details].join("\n"));
};

const difference = (left: string[], right: string[]) =>
  left.filter((item) => !right.includes(item));

for (const testFile of new Set(selected.map((replay) => replay.test))) {
  const run = await runTest(root, testFile);
  const pass =
    run.exitCode === 0 &&
    run.failed.length === 0 &&
    run.skipped.length === 0 &&
    run.passed.length > 0;
  report(pass, `head  ${testFile}`, pass ? [] : [tail(run.output)]);
}

const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
};
const replayDir = path.join(tmpdir(), "myakiba-replay");
await mkdir(replayDir, { recursive: true });
for (const name of await readdir(replayDir)) {
  const pid = Number(/^(\d+)-/.exec(name)?.[1]);
  if (!pid || isAlive(pid)) continue;
  const stale = path.join(replayDir, name);
  await $`git -C ${root} worktree remove --force ${stale}`.nothrow().quiet();
  await rm(stale, { recursive: true, force: true }).catch((error) =>
    console.warn(`could not remove ${stale}: ${error}`),
  );
}

const worktree = await mkdtemp(path.join(replayDir, `${process.pid}-`));
const removeWorktree = () =>
  Bun.spawnSync(["git", "-C", root, "worktree", "remove", "--force", worktree]);
for (const [signal, exitCode] of [
  ["SIGHUP", 129],
  ["SIGINT", 130],
  ["SIGTERM", 143],
] as const) {
  process.on(signal, () => {
    removeWorktree();
    process.exit(exitCode);
  });
}
await $`git -C ${root} worktree add --detach --no-checkout ${worktree}`.quiet();

let installedLock = "";
async function checkOut(revision: string, testFile?: string) {
  await $`git checkout --quiet --detach --force ${revision} && git clean -fdq`.cwd(worktree);
  if (testFile === undefined) return;
  const lock = await $`git rev-parse ${`${revision}:bun.lock`}`.cwd(worktree).text();
  if (lock !== installedLock) {
    await $`bun install --frozen-lockfile`.cwd(worktree).quiet();
    installedLock = lock;
  }

  const packageDir = await packageDirOf(testFile);
  const harness =
    await $`git ls-files --cached --others --exclude-standard ${testFile} ${`${packageDir}/bunfig.toml`} ${`${packageDir}/test.env`} ${`${packageDir}/test`}`
      .cwd(root)
      .text();
  for (const file of harness.split("\n").filter(Boolean))
    await Bun.write(path.join(worktree, file), Bun.file(path.join(root, file)));

  const head = await readPackage(path.join(root, packageDir));
  const atRevision = await readPackage(path.join(worktree, packageDir));
  const declared = { ...atRevision.dependencies, ...atRevision.devDependencies };
  const missing = Object.keys(head.devDependencies ?? {}).filter((name) => !(name in declared));
  if (missing.length > 0) {
    const specs = await Promise.all(
      missing.map(async (name) => `${name}@${await installedVersion(packageDir, name)}`),
    );
    await $`bun add --dev --no-save ${specs}`.cwd(path.join(worktree, packageDir)).quiet();
  }
}

try {
  for (const replay of selectedLint) {
    await checkOut(`${replay.fix}^`);
    const changed = await changedLines(replay.fix);
    const atParent = await lintHits(worktree, replay.rule, changed.atParent);
    await checkOut(replay.fix);
    const atFix = await lintHits(worktree, replay.rule, changed.atFix);
    const details = [
      ...difference(replay.atParent, atParent).map(
        (hit) => `      not flagged at the parent: ${hit}`,
      ),
      ...difference(atParent, replay.atParent).map(
        (hit) => `      also flagged at the parent: ${hit}`,
      ),
      ...difference(replay.atFix, atFix).map((hit) => `      not flagged at the fix: ${hit}`),
      ...difference(atFix, replay.atFix).map((hit) => `      also flagged at the fix: ${hit}`),
    ];
    report(
      atParent.length > 0 && details.length === 0,
      `${replay.fix}^  ${replay.rule}  ${atParent.length} flagged, ${atFix.length} at the fix, for: ${replay.bug}`,
      details,
    );
  }

  for (const replay of selected) {
    await checkOut(`${replay.fix}^`, replay.test);
    const before = await runTest(worktree, replay.test);
    await checkOut(replay.fix, replay.test);
    const after = await runTest(worktree, replay.test);

    const flipped = before.failed.filter((name) => after.passed.includes(name));
    const didNotFlip = replay.fixed.filter((name) => !flipped.includes(name));
    const alsoFlipped = flipped.filter((name) => !replay.fixed.includes(name));
    const pass =
      flipped.length > 0 &&
      !before.errorOutsideTests &&
      !after.errorOutsideTests &&
      didNotFlip.length === 0 &&
      alsoFlipped.length === 0;
    report(pass, `${replay.fix}  ${replay.test}  ${flipped.length} fixed: ${replay.bug}`, [
      ...didNotFlip.map((name) => `      did not flip: ${name}`),
      ...alsoFlipped.map((name) => `      also flipped: ${name}`),
      ...(before.errorOutsideTests || before.failed.length === 0 ? [tail(before.output)] : []),
      ...(after.errorOutsideTests || didNotFlip.length > 0 ? [tail(after.output)] : []),
    ]);
  }
} finally {
  removeWorktree();
}

console.log(`\n${mismatches === 0 ? "every replay matched" : `${mismatches} mismatched`}`);
process.exitCode = mismatches === 0 ? 0 : 1;
