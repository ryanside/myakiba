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
const strictFamily = [
  "alwaysStrict",
  "noImplicitAny",
  "noImplicitThis",
  "strictBindCallApply",
  "strictBuiltinIteratorReturn",
  "strictFunctionTypes",
  "strictNullChecks",
  "strictPropertyInitialization",
  "useUnknownInCatchVariables",
] as const;
type CheckedFlag = (typeof requiredFlags)[number] | (typeof strictFamily)[number];

let failed = false;
for (const consumer of consumers) {
  const shown = await $`tsc --showConfig -p ${path.join(root, consumer)}`.nothrow().quiet();
  if (shown.exitCode !== 0) {
    failed = true;
    console.log(
      `FAIL  ${consumer}: tsc --showConfig exited ${shown.exitCode}\n${shown.stdout}${shown.stderr}`,
    );
    continue;
  }
  const { compilerOptions }: { compilerOptions: Partial<Record<CheckedFlag, boolean>> } =
    shown.json();
  const off = [
    ...requiredFlags.filter((flag) => compilerOptions[flag] !== true),
    ...strictFamily.filter((flag) => compilerOptions[flag] === false),
  ];
  if (off.length > 0) failed = true;
  console.log(
    off.length === 0
      ? `PASS  ${consumer} keeps every required flag`
      : `FAIL  ${consumer} turns off ${off.join(", ")}`,
  );
}
process.exitCode = failed ? 1 : 0;
