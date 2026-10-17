import { $ } from "bun";
import config from "../oxlint.config.ts";

const BUDGET_PATH = "tools/oxlint/budget.json";
const LINT_TOOLING = [
  "**/oxlint.config.*",
  "**/.oxlintrc*",
  "**/.oxlintignore",
  "**/.eslintignore",
  "tools/oxlint/**",
  "scripts/lint-budget.ts",
];
const TOOLING_PATHS = LINT_TOOLING.map((pattern) => `:(glob)${pattern}`);
const CONFIG_PATHS = [...TOOLING_PATHS, `:(exclude)${BUDGET_PATH}`];
const SOURCE_FILES = ["*.js", "*.jsx", "*.mjs", "*.cjs", "*.ts", "*.tsx", "*.mts", "*.cts"];
const DIRECTIVES = [
  /\/\/+\s*(?:eslint|oxlint)-disable(?:-next-line|-line)?\b(?<rest>[^\n]*)/gu,
  /\/\*[\s*]*(?:eslint|oxlint)-disable(?:-next-line|-line)?\b(?<rest>[\s\S]*?)\*\//gu,
];
const GUARD_RULES = new Set(["require-suppression-reason", "no-abusive-eslint-disable"]);
const TRUNK = "origin/main";
const APPROVER = /^\p{L}[^<>]*$/u;

type Budget = Record<string, Record<string, number>>;
type Diagnostic = {
  code: string;
  severity: "error" | "warning";
  message: string;
  help?: string;
  filename: string;
  labels: { span: { line: number; column: number } }[];
};
type LintReport = { diagnostics: Diagnostic[]; number_of_files: number };

const isWellFormed = (budget: Budget) =>
  budget instanceof Object &&
  budget.constructor === Object &&
  Object.values(budget).every(
    (files) =>
      files instanceof Object &&
      files.constructor === Object &&
      Object.values(files).every((hits) => Number.isInteger(hits) && hits > 0),
  );

const describe = ({ code, severity, message, help, filename, labels }: Diagnostic): string => {
  const { line, column } = labels[0]?.span ?? { line: 1, column: 1 };
  return `${filename}:${line}:${column} ${severity} ${code}: ${message}${help ? `\n    help: ${help}` : ""}`;
};

const budget: Budget = await Bun.file(BUDGET_PATH).json();
if (!isWellFormed(budget)) {
  console.error(
    `${BUDGET_PATH} must map each rule to { "<file>": <hits> }, with each count a whole number above 0.`,
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
  const limits = budget[code] ?? {};
  const byFile = Map.groupBy(hits.get(code) ?? [], (diagnostic) => diagnostic.filename);
  const total = Object.values(limits).reduce((sum, limit) => sum + limit, 0);
  console.log(`  ${code}  ${hits.get(code)?.length ?? 0} / ${total}`);
  for (const file of [...new Set([...Object.keys(limits), ...byFile.keys()])].toSorted()) {
    const found = byFile.get(file) ?? [];
    const limit = limits[file] ?? 0;
    if (found.length > limit) {
      failures.push(
        `${code} has ${found.length} hits in ${file}, over its budget of ${limit} there. Fix the new hit instead of raising the budget.\n${found.map(describe).join("\n")}`,
      );
    } else if (found.length < limit) {
      failures.push(
        `${code} has ${found.length} hits in ${file}, under its budget of ${limit} there. ${found.length === 0 ? `Remove "${file}" from "${code}"` : `Lower "${code}" > "${file}" to ${found.length}`} in ${BUDGET_PATH}.`,
      );
    }
  }
}

const sources =
  await $`git ls-files -z --cached --others --exclude-standard -- ${SOURCE_FILES} ${[...LINT_TOOLING, ...config.ignorePatterns].map((pattern) => `:(exclude,glob)${pattern}`)}`
    .quiet()
    .text();
const badDirectives: string[] = [];
for (const name of sources.split("\0").filter(Boolean)) {
  const file = Bun.file(name);
  if (!(await file.exists())) continue;
  const text = await file.text();
  for (const directive of DIRECTIVES) {
    for (const match of text.matchAll(directive)) {
      const rules = (match.groups?.rest ?? "")
        .split("--")[0]
        ?.split(/[\s,]+/u)
        .filter((rule) => rule && !/^\*+$/u.test(rule));
      const guard = rules?.find((rule) => GUARD_RULES.has(rule.split("/").at(-1) ?? ""));
      if (rules?.length && !guard) continue;
      const line = text.slice(0, match.index).split("\n").length;
      badDirectives.push(
        `${name}:${line} ${guard ? `names ${guard}` : "names no rule"}: ${match[0].split("\n")[0]}`,
      );
    }
  }
}
if (badDirectives.length > 0) {
  failures.push(
    `These suppressions switch off every rule or a rule that guards suppressions, so they could hide any hit. Name the one rule to suppress, and leave ${[...GUARD_RULES].join(" and ")} on.\n${badDirectives.join("\n")}`,
  );
}

const mergeBase = await $`git merge-base HEAD ${TRUNK}`.nothrow().quiet().text();
const base = mergeBase.trim();
if (base) {
  const budgetAt = async (revision: string): Promise<Budget> => {
    const listed = await $`git ls-tree --name-only ${revision} -- ${BUDGET_PATH}`.quiet().text();
    if (!listed.trim()) return {};
    const atRevision: Budget = await $`git show ${revision}:${BUDGET_PATH}`.quiet().json();
    return isWellFormed(atRevision) ? atRevision : {};
  };
  const raises = (before: Budget[], after: Budget) =>
    Object.entries(after).flatMap(([code, files]) =>
      Object.entries(files)
        .filter(([file, limit]) => before.every((parent) => limit > (parent[code]?.[file] ?? 0)))
        .map(([file]) => `${code} in ${file}`),
    );
  const approved = async (commit: string) => {
    const approvers =
      await $`git log -1 --format=${"%(trailers:key=Lint-Budget-Approved-By,valueonly,separator=%x00)"} ${commit}`
        .quiet()
        .text();
    return approvers.split("\0").some((approver) => APPROVER.test(approver.trim()));
  };
  const label = async (commit: string) => {
    const subject = await $`git log -1 --format=${"%h %s"} ${commit}`.quiet().text();
    return subject.trim();
  };

  const commits = await $`git rev-list ${base}..HEAD`.quiet().text();
  const ownChanges =
    await $`echo ${commits.trim()} | git diff-tree --stdin --cc --name-only -r -- ${TOOLING_PATHS}`
      .quiet()
      .text();
  const changedFiles = new Map<string, string[]>();
  let commit = "";
  for (const line of ownChanges.split("\n").filter(Boolean)) {
    if (/^[\da-f]{40}$/u.test(line)) commit = line;
    else changedFiles.set(commit, [...(changedFiles.get(commit) ?? []), line]);
  }

  const unapproved: string[] = [];
  for (const [changed, files] of changedFiles) {
    const tooling = files.filter((file) => file !== BUDGET_PATH);
    if (tooling.length > 0 && !(await approved(changed)))
      unapproved.push(`${await label(changed)} changes ${tooling.join(", ")}.`);
    if (!files.includes(BUDGET_PATH)) continue;
    const parents = await $`git rev-parse ${`${changed}^@`}`.quiet().text();
    const before = await Promise.all(parents.split("\n").filter(Boolean).map(budgetAt));
    const raised = raises(before, await budgetAt(changed));
    if (raised.length > 0 && !(await approved(changed)))
      unapproved.push(`${await label(changed)} raises the budget for ${raised.join(", ")}.`);
  }
  const pending = await $`git status --porcelain --untracked-files=all -- ${CONFIG_PATHS}`
    .quiet()
    .text();
  if (pending.trim())
    unapproved.push(`Uncommitted changes to the lint tooling:\n${pending.trimEnd()}`);
  const pendingRaise = raises([await budgetAt("HEAD")], budget);
  if (pendingRaise.length > 0)
    unapproved.push(`Uncommitted ${BUDGET_PATH} raises the budget for ${pendingRaise.join(", ")}.`);
  if (unapproved.length > 0) {
    failures.push(
      `${unapproved.join("\n")}\nEach commit that changes ${LINT_TOOLING.join(", ")} or raises a budget needs a human's approval, merge commits included. Once you have it, end that commit's message with the trailer "Lint-Budget-Approved-By: <name>". If a merge from ${TRUNK} brought the change in, rebase onto ${TRUNK} instead of merging.`,
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
