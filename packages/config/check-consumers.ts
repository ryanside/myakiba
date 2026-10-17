import { $ } from "bun";
import path from "node:path";

const root = path.resolve(import.meta.dir, "../..");
const consumers = ["apps/server", "apps/web"];
const requiredFlags = [
  "strict",
  "noUncheckedIndexedAccess",
  "noUnusedLocals",
  "noUnusedParameters",
  "noFallthroughCasesInSwitch",
  "forceConsistentCasingInFileNames",
  "isolatedModules",
  "verbatimModuleSyntax",
] as const;
type RequiredFlag = (typeof requiredFlags)[number];

let failed = false;
for (const consumer of consumers) {
  const { compilerOptions }: { compilerOptions: Partial<Record<RequiredFlag, boolean>> } =
    await $`tsc --showConfig -p ${path.join(root, consumer)}`.json();
  const missing = requiredFlags.filter((flag) => compilerOptions[flag] !== true);
  if (missing.length > 0) failed = true;
  console.log(
    missing.length === 0
      ? `PASS  ${consumer} keeps every required flag`
      : `FAIL  ${consumer} turns off ${missing.join(", ")}`,
  );
}
process.exitCode = failed ? 1 : 0;
