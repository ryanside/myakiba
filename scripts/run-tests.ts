import path from "node:path";
import { beginTestRun, cleanupTestRun } from "./test-run";
import { checkReplayCoverage } from "./check-replay-coverage";

if (process.argv.length > 2)
  throw new Error(
    "bun run test requires the full suite; run package tests separately for filtering.",
  );
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
const run = await beginTestRun(root);
let code = 0;
try {
  const reporter = ["--reporter=junit", `--reporter-outfile=${run.reportFile}`];
  const steps = [
    {
      name: "Turbo package tests",
      command: [path.join(root, "node_modules/.bin/turbo"), "run", "test", "--", ...reporter],
    },
    { name: "Tooling tests", command: [process.execPath, "run", "test:tooling", ...reporter] },
  ];
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
} finally {
  await cleanupTestRun(run);
  process.off("SIGINT", onInt);
  process.off("SIGTERM", onTerm);
}
if (interrupted) code = interrupted === "SIGINT" ? 130 : 143;
process.exitCode = code;
