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
const forbiddenFlags = ["noCheck"] as const;
type CheckedFlag =
  | (typeof requiredFlags)[number]
  | (typeof strictFamily)[number]
  | (typeof forbiddenFlags)[number];
type ShownConfig = {
  compilerOptions: Partial<Record<CheckedFlag, boolean>>;
  references?: { path: string }[];
};

const checked = new Set<string>();
const lines: string[] = [];

async function checkProject(project: string): Promise<void> {
  if (checked.has(project)) return;
  checked.add(project);
  const label = path.relative(root, project);
  const shown = await $`tsc --showConfig -p ${project}`.nothrow().quiet();
  if (shown.exitCode !== 0) {
    lines.push(
      `FAIL  ${label}: tsc --showConfig exited ${shown.exitCode}\n${shown.stdout}${shown.stderr}`,
    );
    return;
  }
  const { compilerOptions, references = [] }: ShownConfig = shown.json();
  const off = [
    ...requiredFlags.filter((flag) => compilerOptions[flag] !== true),
    ...strictFamily.filter((flag) => compilerOptions[flag] === false),
  ];
  const on = forbiddenFlags.filter((flag) => compilerOptions[flag] === true);
  if (off.length > 0) lines.push(`FAIL  ${label} turns off ${off.join(", ")}`);
  if (on.length > 0) lines.push(`FAIL  ${label} turns on ${on.join(", ")}`);
  if (off.length + on.length === 0) lines.push(`PASS  ${label} keeps every required flag`);
  const configDir = project.endsWith(".json") ? path.dirname(project) : project;
  await Promise.all(
    references.map((reference) => checkProject(path.resolve(configDir, reference.path))),
  );
}

await Promise.all(consumers.map((consumer) => checkProject(path.join(root, consumer))));
for (const line of lines.toSorted()) console.log(line);
process.exitCode = lines.some((line) => line.startsWith("FAIL")) ? 1 : 0;
