import path from "node:path";
import type { Suite, TestRun } from "./test-run";
import { beginTestRun, cleanupTestRun, suites } from "./test-run";
import { checkReplayCoverage } from "./replay-reports";

const [suite, ...extra] = process.argv.slice(2);
function isSuite(name: string): name is Suite {
  return suites.some((known) => known === name);
}
if (extra.length > 0 || (suite !== undefined && !isSuite(suite)))
  throw new Error(`bun run test takes no argument or one suite name: ${suites.join(", ")}.`);
const root = path.resolve(import.meta.dir, "..");
let child: ReturnType<typeof Bun.spawn> | undefined;
let interrupted: "SIGINT" | "SIGTERM" | undefined;
function interrupt(signal: "SIGINT" | "SIGTERM") {
  interrupted ??= signal;
  if (child) {
    try {
      process.kill(-child.pid, signal);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
    }
  }
}
const onInt = () => interrupt("SIGINT");
const onTerm = () => interrupt("SIGTERM");
process.on("SIGINT", onInt);
process.on("SIGTERM", onTerm);
let run: TestRun | undefined;
let code = 0;
let failure: { error: unknown } | undefined;
try {
  run = await beginTestRun(root, suite === undefined ? suites : [suite]);
  const reporter = ["--reporter=junit", `--reporter-outfile=${run.reportFile}`];
  const packageTests = (...filters: string[]) => ({
    name: "Turbo package tests",
    command: [
      path.join(root, "node_modules/.bin/turbo"),
      "run",
      "test",
      ...filters,
      "--",
      ...reporter,
    ],
  });
  const tooling = {
    name: "Tooling tests",
    command: [process.execPath, "run", "test:tooling", ...reporter],
  };
  const bySuite = {
    web: packageTests("--filter=web"),
    packages: packageTests("--filter=!web"),
    tooling,
  };
  const steps = suite === undefined ? [packageTests(), tooling] : [bySuite[suite]];
  for (const step of steps) {
    if (interrupted) break;
    child = Bun.spawn(step.command, {
      cwd: root,
      detached: true,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    code = await child.exited;
    child = undefined;
    if (code !== 0) {
      console.error(`${step.name} failed with exit code ${code}.`);
      break;
    }
  }
  if (!interrupted && code === 0) await checkReplayCoverage(root, run);
} catch (error) {
  failure = { error };
} finally {
  try {
    if (run) await cleanupTestRun(run);
  } catch (error) {
    console.error("Failed to clean test report namespaces:", error);
  } finally {
    process.off("SIGINT", onInt);
    process.off("SIGTERM", onTerm);
  }
}
if (interrupted) {
  if (failure) console.error("Test run failed while interrupted:", failure.error);
  process.exitCode = interrupted === "SIGINT" ? 130 : 143;
} else if (failure) {
  throw failure.error;
} else {
  process.exitCode = code;
}
