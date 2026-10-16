import { $ } from "bun";

const BUDGET_PATH = "tools/oxlint/budget.json";
const LINT_TOOLING = [
  "**/oxlint.config.*",
  "**/.oxlintrc*",
  "tools/oxlint/**",
  "scripts/lint-budget.ts",
];
const CONFIG_PATHS = [
  ...LINT_TOOLING.map((pattern) => `:(glob)${pattern}`),
  `:(exclude)${BUDGET_PATH}`,
];
const SOURCE_FILES = ["*.js", "*.jsx", "*.mjs", "*.cjs", "*.ts", "*.tsx", "*.mts", "*.cts"];
const CHECKER = "require-suppression-reason";
const TRUNK = "origin/main";
const APPROVAL_LINE = /^Lint-Budget-Approved-By: [^\s<]/mu;

type Budget = Record<string, number>;
type Diagnostic = {
  code: string;
  severity: "error" | "warning";
  message: string;
  help?: string;
  filename: string;
  labels: { span: { line: number; column: number } }[];
};
type LintReport = { diagnostics: Diagnostic[]; number_of_files: number };

const describe = ({ code, severity, message, help, filename, labels }: Diagnostic): string => {
  const { line, column } = labels[0]?.span ?? { line: 1, column: 1 };
  return `${filename}:${line}:${column} ${severity} ${code}: ${message}${help ? `\n    help: ${help}` : ""}`;
};

const budget: Budget = await Bun.file(BUDGET_PATH).json();
const malformed = Object.keys(budget).filter(
  (code) => !Number.isInteger(budget[code]) || (budget[code] ?? 0) < 0,
);
if (malformed.length > 0) {
  console.error(
    `${BUDGET_PATH} must give each rule a whole number of hits. Fix ${malformed.join(", ")}.`,
  );
  process.exit(1);
}

const lint = await $`bun x oxlint -f json`.nothrow().quiet();
if (!lint.text().startsWith("{")) {
  console.error(lint.text(), lint.stderr.toString());
  process.exit(1);
}
const report: LintReport = lint.json();
report.diagnostics.sort(
  (a, b) =>
    a.filename.localeCompare(b.filename) ||
    (a.labels[0]?.span.line ?? 0) - (b.labels[0]?.span.line ?? 0),
);

const failures: string[] = [];
const errors = report.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
if (errors.length > 0) failures.push(errors.map(describe).join("\n"));

const hits = Map.groupBy(
  report.diagnostics.filter((diagnostic) => diagnostic.severity === "warning"),
  (diagnostic) => diagnostic.code,
);
console.log(
  `oxlint checked ${report.number_of_files} files. Budgeted rules (${BUDGET_PATH}), count / budget:`,
);
for (const code of [...new Set([...Object.keys(budget), ...hits.keys()])].toSorted()) {
  const found = hits.get(code) ?? [];
  const limit = budget[code];
  console.log(`  ${code}  ${found.length} / ${limit ?? "none"}`);
  if (limit === undefined || found.length > limit) {
    failures.push(
      `${code} has ${found.length} hits, over its budget of ${limit ?? 0}. Fix the new hit instead of raising the budget.\n${found.map(describe).join("\n")}`,
    );
  } else if (found.length < limit) {
    failures.push(
      `${code} has ${found.length} hits, under its budget of ${limit}. Lower "${code}" in ${BUDGET_PATH} to ${found.length}.`,
    );
  }
}

const checkerNamed =
  await $`git grep -n --untracked -F ${CHECKER} -- ${SOURCE_FILES} ${LINT_TOOLING.map((pattern) => `:(exclude,glob)${pattern}`)}`
    .nothrow()
    .quiet();
if (checkerNamed.exitCode !== 1) {
  failures.push(
    `These lines name myakiba/${CHECKER}. Only the lint config may name it, because a directive that switches it off hides every suppression after it. Remove them.\n${checkerNamed.text().trim() || checkerNamed.stderr.toString()}`,
  );
}

const mergeBase = await $`git merge-base HEAD ${TRUNK}`.nothrow().quiet().text();
const base = mergeBase.trim();
if (base) {
  const atTrunk = await $`git ls-tree --name-only ${base} -- ${BUDGET_PATH}`.quiet().text();
  const trunkBudget: Budget = atTrunk.trim()
    ? await $`git show ${base}:${BUDGET_PATH}`.quiet().json()
    : {};
  const raised = Object.keys(budget).filter(
    (code) => (budget[code] ?? 0) > (trunkBudget[code] ?? 0),
  );
  const configDiff = await $`git diff --quiet ${base} -- ${CONFIG_PATHS}`.nothrow().quiet();
  const lastMessage = (paths: string[]) =>
    $`git log -1 --format=%B ${base}..HEAD -- ${paths}`.quiet().text();
  const unapproved = [
    ...(raised.length > 0 && !APPROVAL_LINE.test(await lastMessage([BUDGET_PATH]))
      ? [
          `The budget for ${raised.join(", ")} is above ${TRUNK}. Add the approval line to the last commit that changes ${BUDGET_PATH}.`,
        ]
      : []),
    ...(configDiff.exitCode !== 0 && !APPROVAL_LINE.test(await lastMessage(CONFIG_PATHS))
      ? [
          `The files matching ${LINT_TOOLING.join(", ")} differ from ${TRUNK}, and a config change can switch a rule off. Add the approval line to the last commit that changes them.`,
        ]
      : []),
  ];
  if (unapproved.length > 0) {
    failures.push(
      `${unapproved.join("\n")}\nThis needs a human's approval. Once you have it, the line reads "Lint-Budget-Approved-By: <name>".`,
    );
  }
} else {
  failures.push(
    `Cannot find the merge base with ${TRUNK}, so budget raises cannot be checked. Fetch ${TRUNK}.`,
  );
}

if (failures.length > 0) {
  console.error(`\n${failures.join("\n\n")}`);
  process.exit(1);
}
