import { $ } from "bun";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

type TestReplay = {
  fix: string;
  bug: string;
  test: string;
  fixed: string[];
};

type TestRun = {
  exitCode: number;
  passed: string[];
  failed: string[];
  errorOutsideTests: boolean;
  output: string;
};

const root = path.resolve(import.meta.dir, "..");
const { test: replays }: { test: TestReplay[] } = await Bun.file(
  path.join(import.meta.dir, "replays.json"),
).json();
const filters = process.argv.slice(2);
const selected = replays.filter(
  (replay) =>
    filters.length === 0 ||
    filters.some((filter) => replay.fix.startsWith(filter) || replay.test.includes(filter)),
);
if (selected.length === 0) {
  console.error(`no replay matches ${filters.join(" ")}`);
  process.exit(1);
}

// bun test prints passing tests only when these variables say no agent is running it.
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
  const results = [...output.matchAll(/^\((pass|fail)\) (.+?)(?: \[[\d.]+m?s\])?$/gm)];
  const named = (result: string) => [
    ...new Set(results.filter((match) => match[1] === result).map((match) => match[2] ?? "")),
  ];
  return {
    exitCode,
    passed: named("pass"),
    failed: named("fail"),
    errorOutsideTests: output.includes("# Unhandled error between tests"),
    output,
  };
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

for (const testFile of new Set(selected.map((replay) => replay.test))) {
  const run = await runTest(root, testFile);
  const pass = run.exitCode === 0 && run.failed.length === 0;
  report(pass, `head  ${testFile}`, pass ? [] : [tail(run.output)]);
}

const worktree = await mkdtemp(path.join(tmpdir(), "myakiba-replay-"));
const removeWorktree = () =>
  Bun.spawnSync(["git", "-C", root, "worktree", "remove", "--force", worktree]);
process.on("SIGINT", () => {
  removeWorktree();
  process.exit(130);
});
await $`git -C ${root} worktree add --detach --no-checkout ${worktree}`.quiet();

let installedLock = "";
async function checkOut(revision: string, testFile: string) {
  await $`git checkout --quiet --detach --force ${revision} && git clean -fdq`.cwd(worktree);
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
      ...(after.errorOutsideTests ? [tail(after.output)] : []),
    ]);
  }
} finally {
  removeWorktree();
}

console.log(`\n${mismatches === 0 ? "every replay matched" : `${mismatches} mismatched`}`);
process.exitCode = mismatches === 0 ? 0 : 1;
