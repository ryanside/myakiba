import process from "node:process";

type KnipSymbol = { name: string; line?: number };
type KnipFileIssues = { file: string } & Record<string, KnipSymbol[] | KnipSymbol[][]>;

const BUDGET_PATH = "knip-budget.json";

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

const budget: Record<string, string[]> = await Bun.file(BUDGET_PATH).json();
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
if (knip.exitCode !== 0 || added.length > 0 || fixed.length > 0) {
  process.exit(1);
}
