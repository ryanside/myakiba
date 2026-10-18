import { existsSync, statSync } from "node:fs";
import path from "node:path";

const AGENTS_PATH = "AGENTS.md";
const TABLE_HEADING = "## Rules";
const HEADER = ["Rule", "Enforced by"];
const LINT_CONFIG = "oxlint.config.ts";
const BASE_TSCONFIG = "packages/config/tsconfig.base.json";
const JUDGMENT = "judgment";

type Reference =
  | { kind: "file"; path: string }
  | { kind: "lint rule"; id: string }
  | { kind: "compiler flag"; flag: string }
  | { kind: "script"; name: string };
type Row = { line: number; rule: string; enforcer: string };
type Table = { ok: true; rows: Row[] } | { ok: false; problem: string };
type Loaded<T> = { ok: true; value: T } | { ok: false; reason: string };
type RuleSetting = string | number | [string | number, ...unknown[]];
type LintConfig = {
  default: {
    jsPlugins?: { name: string; specifier: string }[];
    rules?: Record<string, RuleSetting>;
  };
};
type LintRuleModule = { create: (context: never) => Record<string, (node: never) => void> };
type LintPlugin = { default?: { rules?: Record<string, LintRuleModule> } };
type PackageManifest = { scripts?: Record<string, string> };
type TsConfig = { compilerOptions?: Record<string, string | boolean | string[]> };

const classify = (text: string): Reference | undefined => {
  const script = /^bun run (?<name>[\w:-]+)$/u.exec(text)?.groups?.name;
  if (script) return { kind: "script", name: script };
  if (/^\.?[\w@-]+(?:[/.][\w@-]+)*\.[a-z]+$/u.test(text)) return { kind: "file", path: text };
  if (/^(?:[a-z0-9-]+\/)?[a-z0-9]+(?:-[a-z0-9]+)+$/u.test(text))
    return { kind: "lint rule", id: text };
  if (/^[a-z]+(?:[A-Z][a-z]+)+$/u.test(text)) return { kind: "compiler flag", flag: text };
  return undefined;
};

const splitCells = (line: string): string[] => {
  const cells: string[] = [];
  let cell = "";
  let inCode = false;
  for (const char of line.trim()) {
    if (char === "`") inCode = !inCode;
    if (char === "|" && !inCode && !cell.endsWith("\\")) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  return cells.slice(1, -1);
};

const readTable = (text: string): Table => {
  const lines = text.split("\n");
  const heading = lines.findIndex((line) => line.trim() === TABLE_HEADING);
  if (heading === -1) return { ok: false, problem: `has no "${TABLE_HEADING}" heading.` };
  const start = lines.findIndex(
    (line, index) => index > heading && line.trimStart().startsWith("|"),
  );
  if (start === -1) return { ok: false, problem: `has no table under "${TABLE_HEADING}".` };
  if (splitCells(lines[start] ?? "").join("|") !== HEADER.join("|"))
    return {
      ok: false,
      problem: `line ${start + 1}: the table header must be "| ${HEADER.join(" | ")} |".`,
    };
  const rows: Row[] = [];
  for (let index = start + 2; lines[index]?.trimStart().startsWith("|"); index += 1) {
    const [rule = "", enforcer = "", ...extra] = splitCells(lines[index] ?? "");
    if (extra.length > 0)
      return {
        ok: false,
        problem: `line ${index + 1}: a row has more than ${HEADER.length} cells.`,
      };
    rows.push({ line: index + 1, rule, enforcer });
  }
  if (rows.length === 0) return { ok: false, problem: `has no rows under "${TABLE_HEADING}".` };
  return { ok: true, rows };
};

const importModule = async <T>(file: string): Promise<Loaded<T>> => {
  if (!existsSync(file)) return { ok: false, reason: `${file} does not exist` };
  try {
    const value: T = await import(path.resolve(file));
    return { ok: true, value };
  } catch (error) {
    return { ok: false, reason: `${file} does not load (${String(error)})` };
  }
};

const readJson = async <T>(file: string): Promise<T | undefined> => {
  if (!existsSync(file)) return undefined;
  const value: T = await Bun.file(file).json();
  return value;
};

const isOn = (setting: RuleSetting | undefined) => {
  const level = Array.isArray(setting) ? setting[0] : setting;
  return level !== undefined && level !== "off" && level !== "allow" && level !== 0;
};

const manifest = await readJson<PackageManifest>("package.json");
const scripts = manifest?.scripts ?? {};
const tsconfig = await readJson<TsConfig>(BASE_TSCONFIG);
const compilerOptions = tsconfig?.compilerOptions ?? {};
const lintConfig = await importModule<LintConfig>(LINT_CONFIG);

const lintRuleProblem = async (id: string): Promise<string | undefined> => {
  if (!lintConfig.ok) return `\`${id}\` cannot be checked: ${lintConfig.reason}`;
  const config = lintConfig.value.default;
  if (!isOn(config.rules?.[id])) return `\`${id}\` is not turned on in the rules of ${LINT_CONFIG}`;
  const [prefix, name = ""] = id.split("/");
  const plugin = config.jsPlugins?.find((candidate) => candidate.name === prefix);
  if (!plugin) return undefined;
  const loaded = await importModule<LintPlugin>(plugin.specifier);
  if (!loaded.ok) return `\`${id}\` lost its plugin: ${loaded.reason}`;
  return Object.hasOwn(loaded.value.default?.rules ?? {}, name)
    ? undefined
    : `\`${id}\` is not a rule in ${plugin.specifier}`;
};

const problemWith = async (reference: Reference): Promise<string | undefined> => {
  switch (reference.kind) {
    case "file": {
      return existsSync(reference.path) && statSync(reference.path).isFile()
        ? undefined
        : `\`${reference.path}\` does not exist`;
    }
    case "script": {
      return Object.hasOwn(scripts, reference.name)
        ? undefined
        : `\`bun run ${reference.name}\` is not a script in package.json`;
    }
    case "compiler flag": {
      return compilerOptions[reference.flag] === true
        ? undefined
        : `\`${reference.flag}\` is not true in ${BASE_TSCONFIG}`;
    }
    case "lint rule": {
      return lintRuleProblem(reference.id);
    }
  }
};

if (!existsSync(AGENTS_PATH)) {
  console.error(`${AGENTS_PATH} does not exist. Restore it with its rule table.`);
  process.exit(1);
}
const table = readTable(await Bun.file(AGENTS_PATH).text());
if (!table.ok) {
  console.error(`${AGENTS_PATH} ${table.problem}`);
  process.exit(1);
}

const failures: string[] = [];
let judgmentRows = 0;
let referenceCount = 0;
for (const row of table.rows) {
  const label = `${AGENTS_PATH}:${row.line} "${row.rule.length > 60 ? `${row.rule.slice(0, 57)}...` : row.rule}"`;
  const judgment = row.enforcer.startsWith(JUDGMENT);
  if (judgment) judgmentRows += 1;
  const spans = [...row.enforcer.matchAll(/`(?<text>[^`]+)`/gu)].map(
    (match) => match.groups?.text ?? "",
  );
  if (!row.rule) failures.push(`${label} has an empty rule cell.`);
  if (spans.length === 0 && !judgment) {
    failures.push(
      `${label} has no enforcer. Name its check in backticks (a file path, a lint rule id, a compiler flag or \`bun run <script>\`), or start the cell with "${JUDGMENT}".`,
    );
  }
  for (const text of spans) {
    referenceCount += 1;
    const reference = classify(text);
    const problem = reference
      ? await problemWith(reference)
      : `\`${text}\` is not a file path, lint rule id, compiler flag or \`bun run <script>\``;
    if (problem) failures.push(`${label}: ${problem}.`);
  }
}

console.log(
  `${AGENTS_PATH}: ${table.rows.length} rules (${judgmentRows} judgment), ${referenceCount} named checks, ${failures.length} missing enforcers.`,
);
if (failures.length > 0) {
  console.error(
    `${failures.join("\n")}\nRestore each named check, or update its row in ${AGENTS_PATH} to name the check that now enforces the rule.`,
  );
  process.exit(1);
}
