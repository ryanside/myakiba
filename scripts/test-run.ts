import { $ } from "bun";
import { lstat, mkdir, readdir, readlink, rm, stat } from "node:fs/promises";
import path from "node:path";

const identity = Symbol("full test run");
export interface TestRun {
  readonly reportFile: string;
  readonly [identity]: true;
}
type State = {
  root: string;
  source: string;
  workspaces: string[];
  started: number;
  reports: Map<string, string>;
  consumed: boolean;
};
const active = new WeakMap<TestRun, State>();
const runFirst =
  "No active full test run. Run bun run test to generate and verify current reports.";
const rootConfigs = [
  "*.{json,jsonc,toml,yaml,yml,lock,lockb}",
  "*config*.{ts,js,mts,mjs,cts,cjs}",
  ".*rc*",
  ".env*",
  ".gitignore",
  ".gitattributes",
  ".node-version",
  ".tool-versions",
].map((pattern) => new Bun.Glob(pattern));
const orphanAge = 24 * 60 * 60 * 1000;
const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/u;

async function fingerprint(root: string, workspaces: string[]) {
  const revision = await $`git rev-parse HEAD`.cwd(root).quiet().text();
  const tracked = await $`git ls-files --cached -z`.cwd(root).quiet().text();
  const untracked = await $`git ls-files --others --exclude-standard -z`.cwd(root).quiet().text();
  const scopes = [...workspaces, "scripts", "tools"].map(
    (pattern) => new Bun.Glob(`${pattern}/**`),
  );
  const relevant = untracked
    .split("\0")
    .filter(
      (file) =>
        scopes.some((scope) => scope.match(file)) ||
        (!file.includes("/") && rootConfigs.some((config) => config.match(file))),
    );
  const files = new Set([...tracked.split("\0"), ...relevant].filter(Boolean));
  const hash = new Bun.CryptoHasher("sha256").update(revision);
  for (const file of [...files].toSorted()) {
    const filename = path.join(root, file);
    hash.update(file).update("\0");
    try {
      const details = await lstat(filename);
      hash.update(`${details.mode}:`);
      if (details.isSymbolicLink()) hash.update(await readlink(filename)).update("\0");
      const bytes = await Bun.file(filename).arrayBuffer();
      hash.update(`${bytes.byteLength}:`).update(bytes);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      hash.update("deleted:");
    }
  }
  return hash.digest("hex");
}

/** A fresh sibling belongs to another run; only UUID namespaces over a day old are orphans. */
async function pruneOrphans(directory: string) {
  await mkdir(directory, { recursive: true });
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || !uuid.test(entry.name)) continue;
    const candidate = path.join(directory, entry.name);
    try {
      const details = await stat(candidate);
      if (details.mtimeMs < Date.now() - orphanAge)
        await rm(candidate, { recursive: true, force: true });
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
  }
}

/** Each invocation owns a new report namespace; no persisted file authorizes a later check. */
export async function beginTestRun(root: string): Promise<TestRun> {
  const { workspaces }: { workspaces: { packages: string[] } } = await Bun.file(
    path.join(root, "package.json"),
  ).json();
  const directories = new Set([root]);
  for (const pattern of workspaces.packages) {
    for await (const manifest of new Bun.Glob(`${pattern}/package.json`).scan({ cwd: root })) {
      const { scripts }: { scripts?: { test?: string } } = await Bun.file(
        path.join(root, manifest),
      ).json();
      if (scripts?.test) directories.add(path.resolve(root, path.dirname(manifest)));
    }
  }
  const source = await fingerprint(root, workspaces.packages);
  const reportFile = path.join(".test-results", crypto.randomUUID(), "test-results.xml");
  const reports = new Map<string, string>();
  for (const directory of directories) {
    await rm(path.join(directory, "test-results.xml"), { force: true });
    await pruneOrphans(path.join(directory, ".test-results"));
    const report = path.join(directory, reportFile);
    await mkdir(path.dirname(report), { recursive: true });
    reports.set(directory, report);
  }
  const run: TestRun = Object.freeze({ reportFile, [identity]: true as const });
  active.set(run, {
    root,
    reports,
    source,
    workspaces: workspaces.packages,
    started: Date.now(),
    consumed: false,
  });
  return run;
}

/** Claim the single-use run, verify source identity, and require every task's fresh output. */
export async function consumeTestRun(root: string, run?: TestRun) {
  if (!run) throw new Error(runFirst);
  const state = active.get(run);
  if (!state || state.root !== root || state.consumed) throw new Error(runFirst);
  state.consumed = true;
  if ((await fingerprint(root, state.workspaces)) !== state.source)
    throw new Error(
      "Source changed during bun run test (revision or worktree). Run bun run test again.",
    );
  for (const report of state.reports.values()) {
    if (!(await Bun.file(report).exists()))
      throw new Error(
        `Missing current-run Bun JUnit report: ${report}. Run bun run test without filters.`,
      );
    const details = await stat(report);
    if (details.mtimeMs < state.started)
      throw new Error(`Stale Bun JUnit report: ${report}. Run bun run test again.`);
  }
  return state.reports;
}

/** Report readers finish before the runner removes only the namespaces that it owns. */
export async function cleanupTestRun(run: TestRun) {
  const state = active.get(run);
  if (!state) throw new Error(runFirst);
  active.delete(run);
  await Promise.all(
    [...state.reports.values()].map((report) =>
      rm(path.dirname(report), { recursive: true, force: true }),
    ),
  );
}
