import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { $ } from "bun";

const repoRoot = path.resolve(import.meta.dir, "..");
const CHECKER = path.join(repoRoot, "scripts/check-rule-table.ts");
const HEADER = "## Rules\n\n| Rule | Enforced by |\n| --- | --- |\n";
const ROWS = [
  "| Keep the plugin file. | `tools/plugin.mjs` |",
  "| Do not trim ISO strings. | `local/no-iso-slice` |",
  "| Restrict JSON.parse. | `no-restricted-properties` with a budget |",
  "| Index access can be undefined. | `noUncheckedIndexedAccess` |",
  "| Run the knip budget. | `bun run knip` |",
  "| Siblings change together. | judgment, no check proven |",
];

type Run = { exitCode: number; output: string };

const fixtures: string[] = [];
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "rule-table-"));
  fixtures.push(dir);
  const write = (file: string, text: string) => Bun.write(path.join(dir, file), text);
  const writeTable = (rows: string[], header = HEADER) =>
    write("AGENTS.md", `# Agent instructions\n\n${header}${rows.join("\n")}\n`);
  const writeLintConfig = (rules: Record<string, string>) =>
    write(
      "oxlint.config.ts",
      `export default ${JSON.stringify({ jsPlugins: [{ name: "local", specifier: "./tools/plugin.mjs" }], rules })};\n`,
    );
  const run = async (): Promise<Run> => {
    const result = await $`bun ${CHECKER}`.cwd(dir).nothrow().quiet();
    return { exitCode: result.exitCode, output: `${result.stdout}${result.stderr}` };
  };

  await write(
    "tools/plugin.mjs",
    'export default { rules: { "no-iso-slice": { create: () => ({}) } } };\n',
  );
  await writeLintConfig({ "local/no-iso-slice": "warn", "no-restricted-properties": "warn" });
  await write(
    "packages/config/tsconfig.base.json",
    `${JSON.stringify({ compilerOptions: { noUncheckedIndexedAccess: true } })}\n`,
  );
  await write("package.json", `${JSON.stringify({ scripts: { knip: "knip" } })}\n`);
  await writeTable(ROWS);
  return { dir, write, writeTable, writeLintConfig, run };
}

const passes = async (result: Promise<Run>) => {
  const { exitCode, output } = await result;
  expect(exitCode, output).toBe(0);
  return output;
};

const fails = async (result: Promise<Run>, ...reasons: string[]) => {
  const { exitCode, output } = await result;
  expect(exitCode, output).toBe(1);
  for (const reason of reasons) expect(output).toContain(reason);
};

describe("scripts/check-rule-table.ts", () => {
  test("passes the repo's AGENTS.md with 0 missing enforcers", async () => {
    const result = await $`bun ${CHECKER}`.cwd(repoRoot).nothrow().quiet();
    expect(result.exitCode, `${result.stdout}${result.stderr}`).toBe(0);
    expect(result.stdout.toString()).toMatch(/^AGENTS\.md: \d+ rules .*, 0 missing enforcers\.$/mu);
  }, 30_000);

  test("passes when every row names a check that exists or says judgment", async () => {
    const repo = await fixture();
    expect(await passes(repo.run())).toContain("6 rules (1 judgment), 5 named checks");
  });

  test("fails a deleted enforcer file and names its row", async () => {
    const repo = await fixture();
    await rm(path.join(repo.dir, "tools/plugin.mjs"));
    await fails(
      repo.run(),
      'AGENTS.md:7 "Keep the plugin file.": `tools/plugin.mjs` does not exist.',
      'AGENTS.md:8 "Do not trim ISO strings.": `local/no-iso-slice` lost its plugin',
    );
  });

  test("fails every row whose rule lives in a renamed plugin", async () => {
    const repo = await fixture();
    await rename(path.join(repo.dir, "tools/plugin.mjs"), path.join(repo.dir, "tools/moved.mjs"));
    await fails(
      repo.run(),
      "`local/no-iso-slice` lost its plugin: ./tools/plugin.mjs does not exist.",
    );
  });

  test("fails a row with an empty enforcer cell", async () => {
    const repo = await fixture();
    await repo.writeTable([...ROWS, "| A new rule. |  |"]);
    await fails(repo.run(), 'AGENTS.md:13 "A new rule." has no enforcer.');
  });

  test("fails a row whose enforcer cell has only prose", async () => {
    const repo = await fixture();
    await repo.writeTable([...ROWS, "| A new rule. | the review gate |"]);
    await fails(repo.run(), 'AGENTS.md:13 "A new rule." has no enforcer.');
  });

  test("checks the named checks of a judgment row", async () => {
    const repo = await fixture();
    await repo.writeTable([...ROWS, "| Test first. | judgment, plus `scripts/replay.ts` |"]);
    await fails(repo.run(), 'AGENTS.md:13 "Test first.": `scripts/replay.ts` does not exist.');
  });

  test("fails a lint rule that the config turns off or never names", async () => {
    const repo = await fixture();
    await repo.writeLintConfig({ "local/no-iso-slice": "off" });
    await fails(
      repo.run(),
      "`local/no-iso-slice` is not turned on in the rules of oxlint.config.ts.",
      "`no-restricted-properties` is not turned on in the rules of oxlint.config.ts.",
    );
  });

  test("fails a plugin rule id that the plugin does not define", async () => {
    const repo = await fixture();
    await repo.write("tools/plugin.mjs", "export default { rules: {} };\n");
    await fails(repo.run(), "`local/no-iso-slice` is not a rule in ./tools/plugin.mjs.");
  });

  test("fails a lint rule when the lint config is missing", async () => {
    const repo = await fixture();
    await rm(path.join(repo.dir, "oxlint.config.ts"));
    await fails(
      repo.run(),
      "`no-restricted-properties` cannot be checked: oxlint.config.ts does not exist.",
    );
  });

  test("fails a compiler flag the base tsconfig does not turn on", async () => {
    const repo = await fixture();
    await repo.write(
      "packages/config/tsconfig.base.json",
      `${JSON.stringify({ compilerOptions: { noUncheckedIndexedAccess: false } })}\n`,
    );
    await fails(
      repo.run(),
      "`noUncheckedIndexedAccess` is not true in packages/config/tsconfig.base.json.",
    );
  });

  test("fails a package script that does not exist", async () => {
    const repo = await fixture();
    await repo.write("package.json", `${JSON.stringify({ scripts: {} })}\n`);
    await fails(repo.run(), "`bun run knip` is not a script in package.json.");
  });

  test("fails a named check it cannot classify", async () => {
    const repo = await fixture();
    await repo.writeTable([...ROWS, "| Routers live here. | `routers/*/index.ts` |"]);
    await fails(repo.run(), "`routers/*/index.ts` is not a file path, lint rule id");
  });

  test("keeps a pipe inside a code span in its cell", async () => {
    const repo = await fixture();
    await repo.writeTable([...ROWS, "| Write `a | b` here. | `tools/plugin.mjs` |"]);
    await passes(repo.run());
  });

  test("fails a row with an extra cell", async () => {
    const repo = await fixture();
    await repo.writeTable([...ROWS, "| A rule. | `tools/plugin.mjs` | extra |"]);
    await fails(repo.run(), "line 13: a row has more than 2 cells.");
  });

  test("fails without the rule table", async () => {
    const repo = await fixture();
    await repo.writeTable([], "## Other\n\n");
    await fails(repo.run(), 'AGENTS.md has no "## Rules" heading.');
    await repo.writeTable([], "## Rules\n\nNo table.\n");
    await fails(repo.run(), 'AGENTS.md has no table under "## Rules".');
    await repo.writeTable(ROWS, "## Rules\n\n| Rule | Check |\n| --- | --- |\n");
    await fails(repo.run(), 'the table header must be "| Rule | Enforced by |"');
    await repo.writeTable([], HEADER);
    await fails(repo.run(), 'AGENTS.md has no rows under "## Rules".');
    await rm(path.join(repo.dir, "AGENTS.md"));
    await fails(repo.run(), "AGENTS.md does not exist.");
  });
});
