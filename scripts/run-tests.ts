import path from "node:path";
import { beginTestRun } from "./test-run";
import { checkReplayCoverage } from "./check-replay-coverage";

if (process.argv.length > 2)
  throw new Error(
    "bun run test requires the full suite; run package tests separately for filtering.",
  );
const root = path.resolve(import.meta.dir, "..");
const run = await beginTestRun(root);
const reporter = ["--reporter=junit", `--reporter-outfile=${run.reportFile}`];
for (const command of [
  ["turbo", "run", "test", "--", ...reporter],
  [process.execPath, "run", "test:tooling", ...reporter],
]) {
  const child = Bun.spawn(command, {
    cwd: root,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await child.exited;
  if (code !== 0) process.exit(code);
}
await checkReplayCoverage(root, run);
