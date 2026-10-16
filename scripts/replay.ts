import { $ } from "bun";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

type TestReplay = {
  fix: string;
  bug: string;
  test: string;
  fails: string[];
};

type TestRun = {
  exitCode: number;
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

$.env({ ...process.env, HUSKY: "0" });

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
  return {
    exitCode,
    failed: [...output.matchAll(/^\(fail\) (.+?)(?: \[[\d.]+m?s\])?$/gm)].map(
      (match) => match[1] ?? "",
    ),
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

try {
  let installedLock = "";
  for (const replay of selected) {
    const parent = `${replay.fix}^`;
    await $`git checkout --quiet --detach --force ${parent} && git clean -fdq`.cwd(worktree);
    const lock = await $`git rev-parse ${`${parent}:bun.lock`}`.cwd(worktree).text();
    if (lock !== installedLock) {
      await $`bun install --frozen-lockfile`.cwd(worktree).quiet();
      installedLock = lock;
    }

    const packageDir = await packageDirOf(replay.test);
    const harness =
      await $`git ls-files --cached --others --exclude-standard ${replay.test} ${`${packageDir}/bunfig.toml`} ${`${packageDir}/test.env`} ${`${packageDir}/test`}`
        .cwd(root)
        .text();
    for (const file of harness.split("\n").filter(Boolean))
      await Bun.write(path.join(worktree, file), Bun.file(path.join(root, file)));

    const head = await readPackage(path.join(root, packageDir));
    const atParent = await readPackage(path.join(worktree, packageDir));
    const declared = { ...atParent.dependencies, ...atParent.devDependencies };
    const missing = Object.keys(head.devDependencies ?? {}).filter((name) => !(name in declared));
    if (missing.length > 0) {
      const specs = await Promise.all(
        missing.map(async (name) => `${name}@${await installedVersion(packageDir, name)}`),
      );
      await $`bun add --dev --no-save ${specs}`.cwd(path.join(worktree, packageDir)).quiet();
    }

    const run = await runTest(worktree, replay.test);
    const didNotFail = replay.fails.filter((name) => !run.failed.includes(name));
    const alsoFailed = run.failed.filter((name) => !replay.fails.includes(name));
    const pass =
      run.exitCode !== 0 &&
      !run.errorOutsideTests &&
      didNotFail.length === 0 &&
      alsoFailed.length === 0;
    report(pass, `${parent}  ${replay.test}  ${run.failed.length} failed for: ${replay.bug}`, [
      ...didNotFail.map((name) => `      did not fail: ${name}`),
      ...alsoFailed.map((name) => `      also failed: ${name}`),
      ...(run.errorOutsideTests || run.failed.length === 0 ? [tail(run.output)] : []),
    ]);
  }
} finally {
  removeWorktree();
}

console.log(`\n${mismatches === 0 ? "every replay matched" : `${mismatches} mismatched`}`);
process.exitCode = mismatches === 0 ? 0 : 1;
