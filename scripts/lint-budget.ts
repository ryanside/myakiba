import { $ } from "bun";

const BUDGET_PATH = "tools/oxlint/budget.json";
const TRUNK = "origin/main";
const APPROVAL_LINE = /^Lint-Budget-Approved-By: \S/mu;

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

const mergeBase = await $`git merge-base HEAD ${TRUNK}`.nothrow().quiet().text();
const base = mergeBase.trim();
if (base) {
  const trunkFile = await $`git show ${base}:${BUDGET_PATH}`.nothrow().quiet();
  const trunkBudget: Budget = trunkFile.exitCode === 0 ? trunkFile.json() : budget;
  const raised = Object.keys(budget).filter(
    (code) => (budget[code] ?? 0) > (trunkBudget[code] ?? 0),
  );
  const messages = await $`git log --format=%B ${base}..HEAD`.quiet().text();
  if (raised.length > 0 && !APPROVAL_LINE.test(messages)) {
    failures.push(
      `The budget for ${raised.join(", ")} is above ${TRUNK}. A raise needs a human's approval. Once you have it, add "Lint-Budget-Approved-By: <name>" to the commit message.`,
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
