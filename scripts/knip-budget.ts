import process from "node:process";
import { $ } from "bun";

type KnipSymbol = { name: string; line?: number };
type KnipFileIssues = { file: string } & Record<string, KnipSymbol[] | KnipSymbol[][]>;

const BUDGET_PATH = "knip-budget.json";
const KNIP_TOOLING = ["knip.json", BUDGET_PATH, "scripts/knip-budget.ts"];
const TRUNK = "origin/main";
const APPROVER = /^\p{L}[^<>]*$/u;

type Budget = Record<string, string[]>;

const BROKEN_IMPORT_TYPES = new Set(["unlisted", "unresolved", "binaries"]);

const FIXES = new Map([
  ["files", "Delete the file, or import it."],
  ["dependencies", "Remove it from that package.json."],
  ["devDependencies", "Remove it from that package.json."],
  ["optionalPeerDependencies", "Remove it from that package.json."],
  ["unlisted", "Add it to the package.json of the workspace that imports it."],
  ["unresolved", "Fix the import path."],
  ["binaries", "Add the package that provides it to that package.json."],
  ["exports", "Delete the export, or import it."],
  ["types", "Delete the exported type, or import it."],
  ["enumMembers", "Delete the enum member, or use it."],
  ["namespaceMembers", "Delete the namespace member, or use it."],
  ["duplicates", "Export it under one name."],
  ["catalog", "Remove it from the catalog in the root package.json."],
  ["catalogReferences", "Add it to the catalog in the root package.json."],
]);

if (!(await Bun.file(BUDGET_PATH).exists())) {
  console.error(`${BUDGET_PATH} is missing. Restore it from ${TRUNK}.`);
  process.exit(1);
}

const knip = Bun.spawnSync(
  ["bunx", "knip", "--reporter", "json", "--no-progress", "--no-exit-code"],
  {
    env: { ...process.env, DOTENV_CONFIG_QUIET: "true" },
    stderr: "inherit",
  },
);

const report: { issues: KnipFileIssues[] } = JSON.parse(knip.stdout.toString());
const findings = report.issues.flatMap(({ file, ...byType }) =>
  Object.entries(byType).flatMap(([type, items]) =>
    items.map((item) => {
      const symbols = Array.isArray(item) ? item : [item];
      const name = symbols.map((symbol) => symbol.name).join("|");
      const line = symbols[0]?.line;
      return type === "files"
        ? { type, key: file, label: file }
        : { type, key: `${file} ${name}`, label: `${name} at ${line ? `${file}:${line}` : file}` };
    }),
  ),
);

const budget: Budget = await Bun.file(BUDGET_PATH).json();
const budgeted = new Set(
  Object.entries(budget)
    .filter(([type]) => !BROKEN_IMPORT_TYPES.has(type))
    .flatMap(([type, keys]) => keys.map((key) => `${type} ${key}`)),
);
const found = new Set(findings.map(({ type, key }) => `${type} ${key}`));
const added = findings.filter(({ type, key }) => !budgeted.has(`${type} ${key}`));
const fixed = [...budgeted].filter((entry) => !found.has(entry));

const unlisted = findings.filter(({ type }) => type === "unlisted").length;
console.log(
  `knip: ${unlisted} unlisted dependencies. ${findings.length} issues against a budget of ${budgeted.size} in ${BUDGET_PATH}.`,
);
for (const { type, label } of added) {
  console.error(
    `New ${type}: ${label}. ${FIXES.get(type) ?? "See https://knip.dev/reference/issue-types."}`,
  );
}
for (const entry of fixed) {
  const [type, ...key] = entry.split(" ");
  console.error(`Fixed ${type}: remove "${key.join(" ")}" from "${type}" in ${BUDGET_PATH}.`);
}
const entriesOf = (entries: Budget) =>
  new Set(Object.entries(entries).flatMap(([type, keys]) => keys.map((key) => `${type} ${key}`)));
const budgetAt = async (revision: string) => {
  const listed = await $`git ls-tree --name-only ${revision} -- ${BUDGET_PATH}`.quiet().text();
  if (!listed.trim()) return new Set<string>();
  return entriesOf(await $`git show ${`${revision}:${BUDGET_PATH}`}`.quiet().json());
};
const raises = (parents: Set<string>[], after: Set<string>) =>
  [...after].filter((entry) => parents.some((parent) => !parent.has(entry)));
const approved = async (commit: string) => {
  const approvers =
    await $`git log -1 --format=${"%(trailers:key=Lint-Budget-Approved-By,valueonly,separator=%x00)"} ${commit}`
      .quiet()
      .text();
  return approvers.split("\0").some((approver) => APPROVER.test(approver.trim()));
};

const unapproved: string[] = [];
const mergeBase = await $`git merge-base HEAD ${TRUNK}`.nothrow().quiet().text();
const base = mergeBase.trim();
if (base) {
  const history = await $`git log --format=${"%x00%H"} --remerge-diff --name-only ${base}..HEAD`
    .quiet()
    .text();
  for (const entry of history.split("\0").filter(Boolean)) {
    const [commit = "", ...files] = entry.split("\n").filter(Boolean);
    const tooling = files.filter((file) => KNIP_TOOLING.includes(file));
    if (tooling.length === 0 || (await approved(commit))) continue;
    const subject = await $`git log -1 --format=${"%h %s"} ${commit}`.quiet().text();
    const label = subject.trim();
    const changed = tooling.filter((file) => file !== BUDGET_PATH);
    if (changed.length > 0) unapproved.push(`${label} changes ${changed.join(", ")}.`);
    if (!tooling.includes(BUDGET_PATH)) continue;
    const parents = await $`git rev-parse ${`${commit}^@`}`.quiet().text();
    const before = await Promise.all(parents.split("\n").filter(Boolean).map(budgetAt));
    const raised = raises(before, await budgetAt(commit));
    if (raised.length > 0) unapproved.push(`${label} raises the budget for ${raised.join(", ")}.`);
  }
  const pending =
    await $`git status --porcelain --untracked-files=all -- ${KNIP_TOOLING.filter((file) => file !== BUDGET_PATH)}`
      .quiet()
      .text();
  if (pending.trim())
    unapproved.push(`Uncommitted changes to the knip tooling:\n${pending.trimEnd()}`);
  const pendingRaise = raises([await budgetAt("HEAD")], entriesOf(budget));
  if (pendingRaise.length > 0)
    unapproved.push(`Uncommitted ${BUDGET_PATH} raises the budget for ${pendingRaise.join(", ")}.`);
  if (unapproved.length > 0) {
    console.error(
      `${unapproved.join("\n")}\nEach commit that changes ${KNIP_TOOLING.join(", ")} needs a human's approval, merge commits included, unless it only removes ${BUDGET_PATH} entries. Once you have it, add the trailer "Lint-Budget-Approved-By: <name>" to that commit's last paragraph. If a merge from ${TRUNK} brought the change in, rebase onto ${TRUNK} instead of merging.`,
    );
  }
} else {
  console.error(
    `Cannot find the merge base with ${TRUNK}, so budget raises cannot be checked. Fetch ${TRUNK}.`,
  );
}

if (!base || knip.exitCode !== 0 || added.length > 0 || fixed.length > 0 || unapproved.length > 0) {
  process.exit(1);
}
