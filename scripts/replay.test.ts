import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { $ } from "bun";

const root = path.resolve(import.meta.dir, "..");
const fixtures: string[] = [];
const testFile = "src/value.test.ts";
const testName = "the value is fixed in the expected era";
const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: "Fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "Fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
};

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function fixture() {
  const cache = path.join(root, "node_modules/.cache");
  await mkdir(cache, { recursive: true });
  const dir = await mkdtemp(path.join(cache, "replay-test-"));
  fixtures.push(dir);
  const write = (file: string, value: string | Blob) => Bun.write(path.join(dir, file), value);
  const git = (...args: string[]) => $`git ${args}`.cwd(dir).env(gitEnv).quiet();
  const commit = async (message: string) => {
    await git("add", ".");
    await git("commit", "--no-verify", "-qm", message);
    const revision = await git("rev-parse", "HEAD");
    return revision.text().trim();
  };
  const source = (era: string, fixed: boolean) =>
    write("src/value.ts", `export const value = ${JSON.stringify({ era, fixed })};\n`);
  const assertions = (era: string, name = testName, body = "") =>
    write(
      testFile,
      `import { expect, test } from "bun:test";
import { value } from "./value";
test(${JSON.stringify(name)}, async () => {
  ${body}
  expect(value).toEqual(${JSON.stringify({ era, fixed: true })});
});
`,
    );

  for (const script of ["scripts/replay.ts", "scripts/replay-config.ts"])
    await write(script, Bun.file(path.join(root, script)));
  await write(
    "package.json",
    '{"name":"fixture","scripts":{"test":"bun test"},"dependencies":{"fixture-dep":"file:./dependency"}}\n',
  );
  await write("dependency/package.json", '{"name":"fixture-dep","version":"1.0.0"}\n');
  await write(".gitignore", "node_modules\n");
  await $`bun install`.cwd(dir).quiet();
  await git("init", "-q", "-b", "main");
  await source("old", false);
  await assertions("old");
  const base = await commit("broken");
  await source("old", true);
  const fix = await commit("fixed");
  await source("current", true);
  await assertions("current");
  await commit("new era");

  const run = async (entry: { fix: string; base?: string; testAt?: string; atHead?: string[] }) => {
    await write(
      "scripts/replays.json",
      JSON.stringify({
        test: [{ ...entry, bug: "fixture bug", test: testFile, fixed: [testName] }],
      }),
    );
    const result = await $`bun ${path.join(dir, "scripts/replay.ts")}`
      .cwd(dir)
      .env(gitEnv)
      .nothrow()
      .quiet();
    return { exitCode: result.exitCode, output: `${result.stdout}${result.stderr}` };
  };
  return { dir, base, fix, source, assertions, run, write, git, commit };
}

test("testAt uses the pinned test at both the parent and fix while HEAD uses current assertions", async () => {
  const repo = await fixture();
  const { exitCode, output } = await repo.run({ fix: repo.fix, testAt: repo.fix });
  expect(exitCode, output).toBe(0);
  expect(output).toContain("every replay matched");
}, 30_000);

test("an unpinned replay uses the working copy of the test", async () => {
  const repo = await fixture();
  await repo.source("old", true);
  await repo.assertions("old");
  const { exitCode, output } = await repo.run({ fix: repo.fix });
  expect(exitCode, output).toBe(0);
  expect(output).toContain("every replay matched");
}, 30_000);

test("a WORKTREE replay with no behavior change does not flip", async () => {
  const repo = await fixture();
  const { exitCode, output } = await repo.run({ fix: "WORKTREE", base: "HEAD" });
  expect(exitCode, output).toBe(1);
  expect(output).toContain(`did not flip: ${testName}`);
}, 30_000);

test("a WORKTREE replay detects a real behavior change", async () => {
  const repo = await fixture();
  await repo.source("old", true);
  await repo.assertions("old");
  const { exitCode, output } = await repo.run({ fix: "WORKTREE", base: repo.base });
  expect(exitCode, output).toBe(0);
  expect(output).toContain("every replay matched");
}, 30_000);

test("a pinned WORKTREE replay uses the same assertions on both sides and preserves the working test", async () => {
  const repo = await fixture();
  await repo.source("old", true);
  await repo.assertions("old", "current assertions");
  const original = await Bun.file(path.join(repo.dir, testFile)).text();
  const { exitCode, output } = await repo.run({
    fix: "WORKTREE",
    base: repo.base,
    testAt: repo.fix,
    atHead: ["current assertions"],
  });
  expect(exitCode, output).toBe(0);
  expect(output).toContain("every replay matched");
  expect(await Bun.file(path.join(repo.dir, testFile)).text()).toBe(original);
  const files = await readdir(path.join(repo.dir, "src"));
  expect(files.toSorted()).toEqual(["value.test.ts", "value.ts"]);
}, 30_000);

test("a pinned WORKTREE replay never writes into the working checkout", async () => {
  const repo = await fixture();
  await repo.assertions(
    "old",
    testName,
    `expect(import.meta.dir.startsWith(${JSON.stringify(`${repo.dir}${path.sep}`)})).toBe(false);`,
  );
  const testAt = await repo.commit("guard working checkout");
  await repo.source("old", false);
  await repo.git("add", "src/value.ts");
  const index = await repo.git("write-tree");
  await repo.write("src/value.ts", 'export { value } from "./untracked-value";\n');
  await repo.write("src/untracked-value.ts", 'export const value = { era: "old", fixed: true };\n');
  await repo.assertions("old");
  const { exitCode, output } = await repo.run({ fix: "WORKTREE", base: repo.base, testAt });
  expect(exitCode, output).toBe(0);
  expect(output).toContain(`PASS  WORKTREE  ${testFile}  1 fixed`);
  const after = await repo.git("write-tree");
  expect(after.text()).toBe(index.text());
}, 30_000);

test("a pinned replay fails when its guarding test no longer passes at HEAD", async () => {
  const repo = await fixture();
  await repo.assertions("current", "replacement test");
  const { exitCode, output } = await repo.run({ fix: repo.fix, testAt: repo.fix });
  expect(exitCode, output).toBe(1);
  expect(output).toContain(`not passed at head: ${testName}`);
}, 30_000);

test("a pinned replay accepts an explicit renamed guarding test at HEAD", async () => {
  const repo = await fixture();
  await repo.assertions("current", "renamed guarding test");
  const { exitCode, output } = await repo.run({
    fix: repo.fix,
    testAt: repo.fix,
    atHead: ["renamed guarding test"],
  });
  expect(exitCode, output).toBe(0);
  expect(output).toContain("every replay matched");
}, 30_000);

test("a pinned replay fails when an explicit HEAD alias is missing", async () => {
  const repo = await fixture();
  const { exitCode, output } = await repo.run({
    fix: repo.fix,
    testAt: repo.fix,
    atHead: [testName, "missing guarding test"],
  });
  expect(exitCode, output).toBe(1);
  expect(output).toContain("not passed at head: missing guarding test");
}, 30_000);

test("a WORKTREE replay keeps tracked files even when Git ignores them", async () => {
  const repo = await fixture();
  await repo.write(".gitignore", "node_modules\nsrc/ignored-value.ts\n");
  await repo.write("src/ignored-value.ts", 'export const value = { era: "old", fixed: true };\n');
  await repo.git("add", "--force", "src/ignored-value.ts");
  await repo.commit("tracked ignored dependency");
  await repo.source("old", true);
  await repo.assertions(
    "old",
    testName,
    'expect(await Bun.file(new URL("./ignored-value.ts", import.meta.url)).exists()).toBe(true);',
  );
  const { exitCode, output } = await repo.run({ fix: "WORKTREE", base: repo.base });
  expect(exitCode, output).toBe(0);
  expect(output).toContain("every replay matched");
}, 30_000);

test("a WORKTREE replay keeps force-staged ignored files and preserves the real index", async () => {
  const repo = await fixture();
  await repo.write(".gitignore", "node_modules\nsrc/ignored-value.ts\n");
  await repo.write("src/ignored-value.ts", 'export const value = { era: "old", fixed: true };\n');
  await repo.git("add", "--force", "src/ignored-value.ts");
  const indexResult = await repo.git("rev-parse", "--git-path", "index");
  const indexPath = indexResult.text().trim();
  const index = await Bun.file(path.resolve(repo.dir, indexPath)).bytes();
  await repo.source("old", true);
  await repo.assertions(
    "old",
    testName,
    'expect(await Bun.file(new URL("./ignored-value.ts", import.meta.url)).exists()).toBe(true);',
  );
  const { exitCode, output } = await repo.run({ fix: "WORKTREE", base: repo.base });
  expect(exitCode, output).toBe(0);
  expect(output).toContain("every replay matched");
  expect(await Bun.file(path.resolve(repo.dir, indexPath)).bytes()).toEqual(index);
}, 30_000);

async function replayWithoutIndex(repo: Awaited<ReturnType<typeof fixture>>, assertion: string) {
  const indexResult = await repo.git("rev-parse", "--git-path", "index");
  const indexPath = path.resolve(repo.dir, indexResult.text().trim());
  await rm(indexPath);
  await repo.source("old", true);
  await repo.assertions("old", testName, assertion);
  const { exitCode, output } = await repo.run({ fix: "WORKTREE", base: repo.base });
  expect(await Bun.file(indexPath).exists()).toBe(false);
  expect(exitCode, output).toBe(0);
  expect(output).toContain("every replay matched");
}

test("a WORKTREE replay works in a checkout with no index file", async () => {
  await replayWithoutIndex(await fixture(), "");
}, 30_000);

test("a WORKTREE replay keeps tracked ignored files with no index file", async () => {
  const repo = await fixture();
  await repo.write(".gitignore", "node_modules\nsrc/ignored-value.ts\n");
  await repo.write("src/ignored-value.ts", "export const ignored = true;\n");
  await repo.git("add", "--force", "src/ignored-value.ts");
  await repo.commit("tracked ignored dependency");
  await replayWithoutIndex(
    repo,
    'expect(await Bun.file(new URL("./ignored-value.ts", import.meta.url)).exists()).toBe(true);',
  );
}, 30_000);

test("a WORKTREE replay captures assume-unchanged deletions and keeps missing sparse files", async () => {
  const repo = await fixture();
  await repo.write("src/deleted-value.ts", "export const deleted = true;\n");
  await repo.write("src/sparse-value.ts", "export const sparse = true;\n");
  await repo.commit("flagged dependencies");
  await repo.git(
    "update-index",
    "--assume-unchanged",
    "src/deleted-value.ts",
    "src/sparse-value.ts",
  );
  await repo.git("update-index", "--skip-worktree", "src/sparse-value.ts");
  await rm(path.join(repo.dir, "src/deleted-value.ts"));
  await rm(path.join(repo.dir, "src/sparse-value.ts"));
  await repo.source("old", true);
  await repo.assertions(
    "old",
    testName,
    `if (!import.meta.dir.startsWith(${JSON.stringify(`${repo.dir}${path.sep}`)})) {
    expect(await Bun.file(new URL("./deleted-value.ts", import.meta.url)).exists()).toBe(false);
    expect(await Bun.file(new URL("./sparse-value.ts", import.meta.url)).exists()).toBe(true);
  }`,
  );
  const indexResult = await repo.git("rev-parse", "--git-path", "index");
  const indexPath = path.resolve(repo.dir, indexResult.text().trim());
  const index = await Bun.file(indexPath).bytes();
  const { exitCode, output } = await repo.run({ fix: "WORKTREE", base: repo.base });
  expect(await Bun.file(indexPath).bytes()).toEqual(index);
  expect(exitCode, output).toBe(0);
  expect(output).toContain("every replay matched");
}, 30_000);

for (const flag of ["assume-unchanged", "skip-worktree"]) {
  test(`a WORKTREE replay captures a directory replaced by a file with ${flag} and preserves the real index`, async () => {
    const repo = await fixture();
    await repo.write("dir/value.ts", "export const nested = true;\n");
    await repo.commit("tracked directory");
    await repo.git("update-index", `--${flag}`, "dir/value.ts");
    await rm(path.join(repo.dir, "dir"), { recursive: true });
    await repo.write("dir", "replacement\n");
    await repo.source("old", true);
    await repo.assertions(
      "old",
      testName,
      'expect(await Bun.file(new URL("../dir", import.meta.url)).text()).toBe("replacement\\n");',
    );
    const indexResult = await repo.git("rev-parse", "--git-path", "index");
    const indexPath = path.resolve(repo.dir, indexResult.text().trim());
    const index = await Bun.file(indexPath).bytes();
    const { exitCode, output } = await repo.run({ fix: "WORKTREE", base: repo.base });
    expect(await Bun.file(indexPath).bytes()).toEqual(index);
    expect(exitCode, output).toBe(0);
    expect(output).toContain("every replay matched");
  }, 30_000);

  test(`a WORKTREE replay captures edits with ${flag} and preserves the real index`, async () => {
    const repo = await fixture();
    await repo.write("src/sparse-value.ts", "export const sparse = true;\n");
    await repo.commit("sparse dependency");
    await repo.git("update-index", "--skip-worktree", "src/sparse-value.ts");
    await rm(path.join(repo.dir, "src/sparse-value.ts"));
    await repo.git("update-index", `--${flag}`, "src/value.ts");
    await repo.source("old", true);
    await repo.assertions(
      "old",
      testName,
      `if (!import.meta.dir.startsWith(${JSON.stringify(`${repo.dir}${path.sep}`)})) {
    expect(await Bun.file(new URL("./sparse-value.ts", import.meta.url)).exists()).toBe(true);
  }`,
    );
    const indexResult = await repo.git("rev-parse", "--git-path", "index");
    const indexPath = path.resolve(repo.dir, indexResult.text().trim());
    const index = await Bun.file(indexPath).bytes();
    const { exitCode, output } = await repo.run({ fix: "WORKTREE", base: repo.base });
    expect(await Bun.file(indexPath).bytes()).toEqual(index);
    expect(exitCode, output).toBe(0);
    expect(output).toContain("every replay matched");
  }, 30_000);
}
