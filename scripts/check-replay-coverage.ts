import path from "node:path";
import { missingPassedTests } from "./replay-reports";

import type { TestRun } from "./test-run";

export async function checkReplayCoverage(root: string, run: TestRun) {
  const {
    test: replays,
  }: {
    test: {
      test: string;
      testAt?: string;
      fixed: string[];
      head?: { test: string; fixed: string[]; reason: string }[];
    }[];
  } = await Bun.file(path.join(root, "scripts/replays.json")).json();
  const current = replays
    .filter((entry) => entry.testAt)
    .flatMap((entry) => entry.head ?? [{ test: entry.test, fixed: entry.fixed }]);
  const { missing, reports } = await missingPassedTests(root, current, run);
  if (missing.length > 0)
    throw new Error(`Missing passed replay coverage in Bun JUnit reports:\n${missing.join("\n")}`);
  console.log(
    `Verified ${current.reduce((count, entry) => count + entry.fixed.length, 0)} pinned replay names in ${reports} real Bun JUnit reports.`,
  );
}
if (import.meta.main)
  throw new Error(
    "No active full test run. Run bun run test to generate and verify current reports.",
  );
