import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { $ } from "bun";

const repoRoot = path.resolve(import.meta.dir, "../..");
const COPIED = ["oxlint.config.ts", "tools/oxlint/myakiba.mjs", "scripts/lint-budget.ts"];
const BUDGET = "tools/oxlint/budget.json";
const APPROVAL = "Lint-Budget-Approved-By: Some Person";
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "Fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
};
const BASE_BUDGET = { "eslint(no-restricted-properties)": { "src/parse.ts": 1 } };

type Budget = Record<string, Record<string, number>>;

const fixtures: string[] = [];
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "lint-budget-"));
  fixtures.push(dir);
  const git = (...args: string[]) => $`git ${args}`.cwd(dir).env(GIT_ENV).quiet();
  const write = (file: string, text: string | Blob) => Bun.write(path.join(dir, file), text);
  const read = (file: string) => Bun.file(path.join(dir, file)).text();
  const setBudget = (budget: Budget) => write(BUDGET, `${JSON.stringify(budget, null, 2)}\n`);
  const commit = async (subject: string, approved = false) => {
    await git("add", "-A");
    await git("commit", "--no-verify", "-qm", subject, ...(approved ? ["-m", APPROVAL] : []));
  };
  const run = async () => {
    const result = await $`bun scripts/lint-budget.ts`.cwd(dir).env(GIT_ENV).nothrow().quiet();
    return { exitCode: result.exitCode, output: `${result.stdout}${result.stderr}` };
  };

  await Promise.all(COPIED.map((file) => write(file, Bun.file(path.join(repoRoot, file)))));
  await symlink(path.join(repoRoot, "node_modules"), path.join(dir, "node_modules"));
  await write(".gitignore", "node_modules\n");
  await write("src/parse.ts", 'export const parsed = JSON.parse("{}");\n');
  await write("src/plain.ts", "export const plain = 1;\n");
  await setBudget(BASE_BUDGET);
  await git("init", "-q", "-b", "main");
  await commit("trunk", true);
  await git("update-ref", "refs/remotes/origin/main", "HEAD");
  await git("checkout", "-q", "-b", "pr");
  return { dir, git, write, read, setBudget, commit, run };
}

const passes = async (result: Promise<{ exitCode: number; output: string }>) => {
  const { exitCode, output } = await result;
  expect(output).not.toContain("error:");
  expect(exitCode, output).toBe(0);
};

const fails = async (result: Promise<{ exitCode: number; output: string }>, reason: string) => {
  const { exitCode, output } = await result;
  expect(exitCode, output).toBe(1);
  expect(output).toContain(reason);
};

describe("scripts/lint-budget.ts", () => {
  test("passes when every per-file count equals its budget", async () => {
    const repo = await fixture();
    await passes(repo.run());
  }, 30_000);

  test("fails a budget that is not a map of files to whole counts above 0", async () => {
    const repo = await fixture();
    for (const value of ['"1"', "0.5", "0", "1"]) {
      await repo.write(
        BUDGET,
        value === "1"
          ? '{ "eslint(no-restricted-properties)": 1 }\n'
          : `{ "eslint(no-restricted-properties)": { "src/parse.ts": ${value} } }\n`,
      );
      await fails(repo.run(), "must map each rule");
    }
  }, 30_000);

  test("fails on any lint error", async () => {
    const repo = await fixture();
    await repo.write("src/error.ts", "export const value = 1 == 1;\n");
    await fails(repo.run(), "error eslint(eqeqeq)");
  }, 30_000);

  test("fails a new hit in one file even when another file's hit is removed", async () => {
    const repo = await fixture();
    await repo.write("src/parse.ts", "export const parsed = 1;\n");
    await repo.write("src/moved.ts", 'export const moved = JSON.parse("{}");\n');
    await fails(repo.run(), "1 hits in src/moved.ts, over its budget of 0 there");
  }, 30_000);

  test("lints a tracked file even when .gitignore lists it", async () => {
    const repo = await fixture();
    await repo.write("src/hidden.ts", 'export const hidden = JSON.parse("{}");\n');
    await repo.write(".gitignore", "node_modules\nsrc/hidden.ts\n");
    await repo.git("add", "-f", "src/hidden.ts", ".gitignore");
    await repo.git("commit", "--no-verify", "-qm", "hide a parse");
    await fails(repo.run(), "1 hits in src/hidden.ts, over its budget of 0 there");
  }, 30_000);

  test("fails a hit from a rule with no budget", async () => {
    const repo = await fixture();
    await repo.write("src/day.ts", "export const day = new Date().toISOString().slice(0, 10);\n");
    await fails(repo.run(), "myakiba(no-iso-slice) has 1 hits in src/day.ts, over its budget of 0");
  }, 30_000);

  test("fails a count under budget until the budget is lowered, which needs no approval", async () => {
    const repo = await fixture();
    await repo.write("src/parse.ts", "export const parsed = 1;\n");
    await repo.commit("drop the parse");
    await fails(repo.run(), 'Remove "src/parse.ts" from "eslint(no-restricted-properties)"');
    await repo.setBudget({});
    await repo.commit("lower the budget");
    await passes(repo.run());
  }, 30_000);

  test("fails a directive that names no rule or names a guard rule, wherever it sits", async () => {
    const repo = await fixture();
    const directives = [
      ["/* oxlint-disable */", "names no rule"],
      ["// eslint-disable-next-line", "names no rule"],
      ["/*\n oxlint-disable\n*/", "names no rule"],
      [
        "// oxlint-disable-next-line myakiba/require-suppression-reason",
        "names require-suppression-reason",
      ],
      [
        "/* oxlint-disable\n   myakiba/require-suppression-reason */",
        "names require-suppression-reason",
      ],
      [
        "/* oxlint-disable unicorn/no-abusive-eslint-disable -- safe (until 2099-01-01, approved by A) */",
        "names no-abusive-eslint-disable",
      ],
      [
        "/* oxlint-disable unicorn/no-abusive-eslint-disable -- safe (until 2099-01-01, approved by A) */\n/* oxlint-disable */",
        "names no rule",
      ],
      [
        'export const marker = "/* oxlint-disable harmless -- ";\n/* oxlint-disable myakiba/require-suppression-reason */',
        "names require-suppression-reason",
      ],
    ];
    for (const [directive = "", reason = ""] of directives) {
      await repo.write("src/directive.ts", `${directive}\nexport const value = 1;\n`);
      await fails(repo.run(), reason);
    }
  }, 60_000);

  test("passes directive text that is string data, not a comment", async () => {
    const repo = await fixture();
    await repo.write(
      "src/fixture.ts",
      [
        'export const blanket = "/* oxlint-disable */";',
        "export const guard = '// oxlint-disable-next-line myakiba/require-suppression-reason';",
        "export const template = `/* eslint-disable */`;",
        "export const pattern = /\\/\\* oxlint-disable \\*\\//u;",
        "",
      ].join("\n"),
    );
    await passes(repo.run());
  }, 30_000);

  test("fails an unapproved commit to each lint tooling path, and passes it approved", async () => {
    const edits: [file: string, text: (current: string) => string][] = [
      [
        "oxlint.config.ts",
        (current) => current.replace('"sort-keys": "off",', '"sort-keys": "off", // pr edit'),
      ],
      ["src/nested/.oxlintrc.json", () => "{}\n"],
      [".oxlintignore", () => "src/ignored.ts\n"],
      [".eslintignore", () => "src/ignored.ts\n"],
      ["tools/oxlint/notes.txt", () => "notes\n"],
      ["scripts/lint-budget.ts", (current) => `${current}\n`],
    ];
    for (const [file, edit] of edits) {
      const repo = await fixture();
      const current = await repo.read(file).catch(() => "");
      await repo.write(file, edit(current));
      await repo.commit(`edit ${file}`);
      await fails(repo.run(), `edit ${file} changes ${file}`);
      await repo.git(
        "commit",
        "--no-verify",
        "-q",
        "--amend",
        "-m",
        `edit ${file}`,
        "-m",
        APPROVAL,
      );
      await passes(repo.run());
    }
  }, 120_000);

  test("counts only a real Git trailer whose value names someone", async () => {
    const messages = [
      "raise\n\nLint-Budget-Approved-By: <name>",
      "raise\n\nLint-Budget-Approved-By: >",
      "raise\n\n```text\nLint-Budget-Approved-By: Some Person\n```\n\nQuoted docs, not a trailer.",
    ];
    for (const message of messages) {
      const repo = await fixture();
      await repo.write("src/more.ts", 'export const more = JSON.parse("{}");\n');
      await repo.setBudget({
        "eslint(no-restricted-properties)": { "src/parse.ts": 1, "src/more.ts": 1 },
      });
      await repo.git("add", "-A");
      await repo.git("commit", "--no-verify", "-qm", message);
      await fails(
        repo.run(),
        "raises the budget for eslint(no-restricted-properties) in src/more.ts",
      );
    }
  }, 60_000);

  test("needs approval on the commit that raises a budget, not on a later lowering", async () => {
    const repo = await fixture();
    await repo.write("src/more.ts", 'export const more = JSON.parse("{}");\n');
    await repo.setBudget({
      "eslint(no-restricted-properties)": { "src/parse.ts": 1, "src/more.ts": 1 },
    });
    await repo.commit("raise");
    await fails(repo.run(), "raise raises the budget");
    await repo.git("commit", "--no-verify", "-q", "--amend", "-m", "raise", "-m", APPROVAL);
    await passes(repo.run());
    await repo.write("src/parse.ts", "export const parsed = 1;\n");
    await repo.setBudget({ "eslint(no-restricted-properties)": { "src/more.ts": 1 } });
    await repo.commit("lower");
    await passes(repo.run());
  }, 60_000);

  test("fails an unapproved commit even when a later or twin commit is approved", async () => {
    const repo = await fixture();
    await repo.write("tools/oxlint/twin.txt", "twin\n");
    await repo.commit("twin unapproved");
    await repo.git("checkout", "-q", "-b", "twin", "main");
    await repo.write("tools/oxlint/twin.txt", "twin\n");
    await repo.commit("twin approved", true);
    await repo.git("checkout", "-q", "pr");
    await repo.git("merge", "-q", "--no-ff", "-m", "merge twins", "-m", APPROVAL, "twin");
    await repo.write("tools/oxlint/later.txt", "later\n");
    await repo.commit("later approved", true);
    await fails(repo.run(), "twin unapproved changes tools/oxlint/twin.txt");
  }, 30_000);

  test("checks a merge commit's own edits and passes a clean CI merge", async () => {
    const repo = await fixture();
    await repo.git("checkout", "-q", "-b", "side", "main");
    await repo.write("src/side.ts", "export const side = 1;\n");
    await repo.commit("side");
    await repo.git("checkout", "-q", "pr");
    await repo.git("merge", "-q", "--no-ff", "--no-commit", "side");
    await repo.write("src/more.ts", 'export const more = JSON.parse("{}");\n');
    await repo.setBudget({
      "eslint(no-restricted-properties)": { "src/parse.ts": 1, "src/more.ts": 1 },
    });
    await repo.commit("merge side");
    await fails(repo.run(), "merge side raises the budget");

    const ci = await fixture();
    const configText = await ci.read("oxlint.config.ts");
    await ci.write(
      "oxlint.config.ts",
      configText.replace('"sort-keys": "off",', '"sort-keys": "off", // pr edit'),
    );
    await ci.commit("pr config edit", true);
    await ci.git("checkout", "-q", "main");
    await ci.write(
      "oxlint.config.ts",
      configText.replace(
        '"no-use-before-define": "off",',
        '"no-use-before-define": "off", // main edit',
      ),
    );
    await ci.commit("main config edit", true);
    await ci.git("update-ref", "refs/remotes/origin/main", "HEAD");
    await ci.git("merge", "-q", "--no-ff", "-m", "Merge pr into main", "pr");
    await passes(ci.run());
  }, 60_000);

  test("fails a merge that resolves trunk's lowered budget or config back to the PR side", async () => {
    const lowered = await fixture();
    await lowered.write("src/side.ts", "export const side = 1;\n");
    await lowered.commit("pr work");
    await lowered.git("checkout", "-q", "main");
    await lowered.write("src/parse.ts", "export const parsed = 1;\n");
    await lowered.setBudget({});
    await lowered.commit("trunk lowers");
    await lowered.git("update-ref", "refs/remotes/origin/main", "HEAD");
    await lowered.git("checkout", "-q", "pr");
    await lowered.git("merge", "-q", "--no-ff", "--no-commit", "main");
    await lowered.git("checkout", "pr", "--", "src/parse.ts", BUDGET);
    await lowered.commit("merge trunk");
    await fails(
      lowered.run(),
      "merge trunk raises the budget for eslint(no-restricted-properties)",
    );

    const reverted = await fixture();
    const configText = await reverted.read("oxlint.config.ts");
    await reverted.write("src/side.ts", "export const side = 1;\n");
    await reverted.commit("pr work");
    await reverted.git("checkout", "-q", "main");
    await reverted.write(
      "oxlint.config.ts",
      configText.replace('"sort-keys": "off",', '"sort-keys": "off", // trunk edit'),
    );
    await reverted.commit("trunk config edit", true);
    await reverted.git("update-ref", "refs/remotes/origin/main", "HEAD");
    await reverted.git("checkout", "-q", "pr");
    await reverted.git("merge", "-q", "--no-ff", "--no-commit", "main");
    await reverted.git("checkout", "pr", "--", "oxlint.config.ts");
    await reverted.commit("merge trunk");
    await fails(reverted.run(), "merge trunk changes oxlint.config.ts");
  }, 60_000);

  test("checks an octopus merge's own edits, which git's remerge diff skips", async () => {
    for (const [edit, reason] of [
      ["tooling", "octopus changes tools/oxlint/octopus.txt"],
      ["raise", "octopus raises the budget for eslint(no-restricted-properties) in src/more.ts"],
    ] as const) {
      const repo = await fixture();
      for (const branch of ["left", "right"]) {
        await repo.git("checkout", "-q", "-b", branch, "main");
        await repo.write(`src/${branch}.ts`, `export const ${branch} = 1;\n`);
        await repo.commit(branch);
      }
      await repo.git("checkout", "-q", "pr");
      await repo.git("merge", "-q", "--no-ff", "--no-commit", "left", "right");
      if (edit === "tooling") await repo.write("tools/oxlint/octopus.txt", "octopus\n");
      else {
        await repo.write("src/more.ts", 'export const more = JSON.parse("{}");\n');
        await repo.setBudget({
          "eslint(no-restricted-properties)": { "src/parse.ts": 1, "src/more.ts": 1 },
        });
      }
      await repo.commit("octopus");
      await fails(repo.run(), reason);
      await repo.git("commit", "--no-verify", "-q", "--amend", "-m", "octopus", "-m", APPROVAL);
      await passes(repo.run());
    }
  }, 60_000);

  test("fails uncommitted tooling changes and an uncommitted raise", async () => {
    const repo = await fixture();
    await repo.write("tools/oxlint/notes.txt", "notes\n");
    await fails(repo.run(), "Uncommitted changes to the lint tooling");
    await rm(path.join(repo.dir, "tools/oxlint/notes.txt"));
    await repo.write("src/more.ts", 'export const more = JSON.parse("{}");\n');
    await repo.setBudget({
      "eslint(no-restricted-properties)": { "src/parse.ts": 1, "src/more.ts": 1 },
    });
    await fails(repo.run(), `Uncommitted ${BUDGET} raises the budget`);
  }, 30_000);

  test("fails when there is no merge base with origin/main", async () => {
    const repo = await fixture();
    await repo.git("update-ref", "-d", "refs/remotes/origin/main");
    await fails(repo.run(), "Cannot find the merge base with origin/main");
  }, 30_000);
});
