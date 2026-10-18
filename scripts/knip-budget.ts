import process from "node:process";
import { $ } from "bun";

type KnipSymbol = { name: string; line?: number };
type KnipFileIssues = { file: string } & Record<string, KnipSymbol[] | KnipSymbol[][]>;

const BUDGET_PATH = "knip-budget.json";
const KNIP_TOOLING = ["knip.json", BUDGET_PATH, "scripts/knip-budget.ts", "pnpm-workspace.yaml"];
const MANIFEST = "package.json";
const MANIFEST_SETTINGS = "the knip or workspaces key in package.json";
const SOURCE_FILES = ["*.js", "*.jsx", "*.mjs", "*.cjs", "*.ts", "*.tsx", "*.mts", "*.cts"];
const SKIPPED_TAG = "@(public|beta|alias)([^[:alnum:]_]|$)";
const TRUNK = "origin/main";
const APPROVER = /^\p{L}[^<>]*$/u;

type Budget = Record<string, string[]>;
type KnipManifest = { knip?: object; workspaces?: object };

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

const knip = await $`bunx knip --reporter json --no-progress --no-exit-code`
  .env({ ...process.env, DOTENV_CONFIG_QUIET: "true" })
  .nothrow()
  .quiet();
if (knip.stderr.length > 0) console.error(knip.stderr.toString().trimEnd());

const report: { issues: KnipFileIssues[] } = knip.json();
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
const knipSettings = ({ knip: config = null, workspaces = null }: KnipManifest) =>
  JSON.stringify({ knip: config, workspaces });
const knipSettingsAt = async (revision: string) => {
  const shown = await $`git show ${`${revision}:${MANIFEST}`}`.nothrow().quiet();
  return shown.exitCode === 0 ? knipSettings(shown.json()) : "";
};
const settingsChanged = async (commit: string, parents: string[]) => {
  const after = await knipSettingsAt(commit);
  const before = parents.length > 0 ? await Promise.all(parents.map(knipSettingsAt)) : [""];
  return before.some((settings) => settings !== after);
};
const labelOf = async (commit: string) => {
  const subject = await $`git log -1 --format=${"%h %s"} ${commit}`.quiet().text();
  return subject.trim();
};

const unapproved: string[] = [];
const mergeBase = await $`git merge-base HEAD ${TRUNK}`.nothrow().quiet().text();
const base = mergeBase.trim();
if (base) {
  const history = await $`git log --format=${"%x00%H %P"} --remerge-diff --name-only ${base}..HEAD`
    .quiet()
    .text();
  for (const entry of history.split("\0").filter(Boolean)) {
    const [header = "", ...files] = entry.split("\n").filter(Boolean);
    const [commit = "", ...parents] = header.split(" ").filter(Boolean);
    if (parents.length > 2) {
      const diffs = await Promise.all(
        parents.map((parent) =>
          $`git diff --name-only ${parent} ${commit} -- ${KNIP_TOOLING}`.quiet().text(),
        ),
      );
      const differing = [...new Set(diffs.flatMap((diff) => diff.split("\n").filter(Boolean)))];
      if (await settingsChanged(commit, parents)) differing.push(MANIFEST_SETTINGS);
      if (differing.length > 0)
        unapproved.push(
          `${await labelOf(commit)} merges ${parents.length} branches and differs from one of them in ${differing.join(", ")}. Git cannot show an octopus merge's own changes, so merge one branch at a time.`,
        );
      continue;
    }
    const tooling = files.filter((file) => KNIP_TOOLING.includes(file) || file === MANIFEST);
    if (tooling.length === 0 || (await approved(commit))) continue;
    const label = await labelOf(commit);
    const changed = tooling.filter((file) => file !== BUDGET_PATH && file !== MANIFEST);
    if (tooling.includes(MANIFEST) && (await settingsChanged(commit, parents)))
      changed.push(MANIFEST_SETTINGS);
    if (changed.length > 0) unapproved.push(`${label} changes ${changed.join(", ")}.`);
    if (!tooling.includes(BUDGET_PATH)) continue;
    const before =
      parents.length > 0 ? await Promise.all(parents.map(budgetAt)) : [new Set<string>()];
    const raised = raises(before, await budgetAt(commit));
    if (raised.length > 0) unapproved.push(`${label} raises the budget for ${raised.join(", ")}.`);
  }
  const pending =
    await $`git status --porcelain --untracked-files=all -- ${KNIP_TOOLING.filter((file) => file !== BUDGET_PATH)}`
      .quiet()
      .text();
  if (pending.trim())
    unapproved.push(`Uncommitted changes to the knip tooling:\n${pending.trimEnd()}`);
  if ((await knipSettingsAt("HEAD")) !== knipSettings(await Bun.file(MANIFEST).json()))
    unapproved.push(`Uncommitted changes to ${MANIFEST_SETTINGS}.`);
  const pendingRaise = raises([await budgetAt("HEAD")], entriesOf(budget));
  if (pendingRaise.length > 0)
    unapproved.push(`Uncommitted ${BUDGET_PATH} raises the budget for ${pendingRaise.join(", ")}.`);
  if (unapproved.length > 0) {
    console.error(
      `${unapproved.join("\n")}\nEach commit that changes ${KNIP_TOOLING.join(", ")} or ${MANIFEST_SETTINGS} needs a human's approval, merge commits included, unless it only removes ${BUDGET_PATH} entries. Once you have it, add the trailer "Lint-Budget-Approved-By: <name>" to that commit's last paragraph. If a merge from ${TRUNK} brought the change in, rebase onto ${TRUNK} instead of merging.`,
    );
  }
} else {
  console.error(
    `Cannot find the merge base with ${TRUNK}, so budget raises cannot be checked. Fetch ${TRUNK}.`,
  );
}

const tagged = await $`git grep -n --untracked -I -E ${SKIPPED_TAG} -- ${SOURCE_FILES}`
  .nothrow()
  .quiet()
  .text();
if (tagged.trim())
  console.error(
    `${tagged.trimEnd()}\nknip never reports an export tagged public, beta or alias, so these tags can hide dead code. Remove the tag, or list the export as an entry in knip.json, which needs approval.`,
  );
const ignored = await $`git ls-files -ci --exclude-standard -- ${SOURCE_FILES}`.quiet().text();
if (ignored.trim())
  console.error(
    `${ignored.trimEnd()}\nThese committed files match .gitignore, so knip skips them. Remove the .gitignore pattern, or delete the files.`,
  );

if (
  tagged.trim() ||
  ignored.trim() ||
  !base ||
  knip.exitCode !== 0 ||
  added.length > 0 ||
  fixed.length > 0 ||
  unapproved.length > 0
) {
  process.exit(1);
}
