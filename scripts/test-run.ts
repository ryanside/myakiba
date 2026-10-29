import { constants } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { lstat, mkdir, open, rm } from "node:fs/promises";
import path from "node:path";

const identity = Symbol("full test run");
export interface TestRun {
  readonly reportFile: string;
  readonly [identity]: true;
}
type Namespace = { directory: string; dev: number; ino: number };
type State = {
  root: string;
  reports: Map<string, string>;
  created: Namespace[];
  consumed: boolean;
};
const active = new WeakMap<TestRun, State>();
const runFirst =
  "No active full test run. Run bun run test to generate and verify current reports.";

async function realDirectory(directory: string) {
  const details = await lstat(directory);
  if (!details.isDirectory())
    throw new Error(
      `Test report parent must be a real directory, not a symlink or file: ${directory}`,
    );
}
async function ownedDirectory(namespace: Namespace) {
  await realDirectory(path.dirname(namespace.directory));
  const details = await lstat(namespace.directory);
  if (!details.isDirectory() || details.dev !== namespace.dev || details.ino !== namespace.ino)
    throw new Error(
      `Test report namespace was replaced; refusing to remove or read it: ${namespace.directory}`,
    );
}
async function removeCreated(created: Namespace[]) {
  const results = await Promise.allSettled(
    created.map(async (namespace) => {
      await ownedDirectory(namespace);
      await rm(namespace.directory, { recursive: true });
    }),
  );
  const errors = results
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason);
  if (errors.length) throw new AggregateError(errors, "Could not remove test report namespaces");
}

/** A run trusts only reports inside directories it freshly created, through its private handle. */
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
  const created: Namespace[] = [];
  try {
    for (const directory of directories) {
      await rm(path.join(directory, "test-results.xml"), { force: true });
      const parent = path.join(directory, ".test-results");
      try {
        await mkdir(parent);
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
      }
      await realDirectory(parent);
      const report = path.join(directory, reportFile);
      const namespace = path.dirname(report);
      await mkdir(namespace);
      const { dev, ino } = await lstat(namespace);
      created.push({ directory: namespace, dev, ino });
      reports.set(directory, report);
    }
  } catch (error) {
    try {
      await removeCreated(created);
    } catch (cleanupError) {
      console.error("Failed to roll back test report namespaces:", cleanupError);
    }
    throw error;
  }
  const run: TestRun = Object.freeze({ reportFile, [identity]: true as const });
  active.set(run, { root, reports, created, consumed: false });
  return run;
}

async function readReport(report: string) {
  const invalid = `Bun JUnit report must be a regular file; symlinks are not allowed: ${report}`;
  let file: FileHandle;
  try {
    file = await open(report, constants.O_RDONLY + constants.O_NOFOLLOW + constants.O_NONBLOCK);
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      if (error.code === "ELOOP") throw new Error(invalid, { cause: error });
      if (error.code === "ENOENT")
        throw new Error(
          `Missing current-run Bun JUnit report: ${report}. Run bun run test without filters.`,
          { cause: error },
        );
    }
    throw error;
  }
  try {
    const details = await file.stat();
    if (!details.isFile()) throw new Error(invalid);
    return await file.readFile("utf-8");
  } finally {
    await file.close();
  }
}

/** Consume each regular report through its checked handle, returning contents rather than paths. */
export async function consumeTestRun(root: string, run?: TestRun) {
  if (!run) throw new Error(runFirst);
  const state = active.get(run);
  if (!state || state.root !== root || state.consumed) throw new Error(runFirst);
  state.consumed = true;
  for (const namespace of state.created) await ownedDirectory(namespace);
  const contents = new Map<string, string>();
  for (const [directory, report] of state.reports)
    contents.set(directory, await readReport(report));
  return contents;
}

/** Readers finish before the runner removes only its own directories. */
export async function cleanupTestRun(run: TestRun) {
  const state = active.get(run);
  if (!state) throw new Error(runFirst);
  active.delete(run);
  await removeCreated(state.created);
}
