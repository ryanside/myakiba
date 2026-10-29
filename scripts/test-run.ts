import { $ } from "bun";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const identity = Symbol("full test run");
export interface TestRun {
  readonly reportFile: string;
  readonly [identity]: true;
}
type State = { root: string; source: string; started: number; reports: Map<string, string> };
const active = new WeakMap<TestRun, State>();
const runFirst =
  "No active full test run. Run bun run test to generate and verify current reports.";

async function fingerprint(root: string) {
  const revision = await $`git rev-parse HEAD`.cwd(root).quiet().text();
  const files = await $`git ls-files --cached --others --exclude-standard -z`
    .cwd(root)
    .quiet()
    .text();
  const modeChanges = await $`git diff --raw HEAD`.cwd(root).quiet().text();
  const hash = new Bun.CryptoHasher("sha256").update(revision).update(modeChanges);
  for (const file of [...new Set(files.split("\0").filter(Boolean))].toSorted()) {
    const input = Bun.file(path.join(root, file));
    hash.update(file).update("\0");
    if (await input.exists()) {
      const bytes = await input.arrayBuffer();
      hash.update(`${bytes.byteLength}:`).update(bytes);
    } else hash.update("deleted:");
  }
  return hash.digest("hex");
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
  const reportFile = path.join(".test-results", crypto.randomUUID(), "test-results.xml");
  const reports = new Map<string, string>();
  for (const directory of directories) {
    await rm(path.join(directory, "test-results.xml"), { force: true });
    const report = path.join(directory, reportFile);
    await mkdir(path.dirname(report), { recursive: true });
    reports.set(directory, report);
  }
  const run: TestRun = Object.freeze({ reportFile, [identity]: true as const });
  active.set(run, { root, reports, source: await fingerprint(root), started: Date.now() });
  return run;
}

/** Claim the single-use run, verify source identity, and require every task's fresh output. */
export async function consumeTestRun(root: string, run?: TestRun) {
  if (!run) throw new Error(runFirst);
  const state = active.get(run);
  if (!state || state.root !== root) throw new Error(runFirst);
  active.delete(run);
  if ((await fingerprint(root)) !== state.source)
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
