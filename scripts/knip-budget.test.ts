import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { $ } from "bun";

const repoRoot = path.resolve(import.meta.dir, "..");
const COPIED = ["knip.json", "scripts/knip-budget.ts"];
const BUDGET = "knip-budget.json";
const APPROVAL = "Lint-Budget-Approved-By: Some Person";
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "Fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
};
const BASE_BUDGET = { files: ["src/dead.ts"] };

type Budget = Record<string, string[]>;

const fixtures: string[] = [];
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "knip-budget-"));
  fixtures.push(dir);
  const git = (...args: string[]) => $`git ${args}`.cwd(dir).env(GIT_ENV).quiet();
  const write = (file: string, text: string | Blob) => Bun.write(path.join(dir, file), text);
  const read = (file: string) => Bun.file(path.join(dir, file)).text();
  const readConfig = (): Promise<object> => Bun.file(path.join(dir, "knip.json")).json();
  const setBudget = (budget: Budget) => write(BUDGET, `${JSON.stringify(budget, null, 2)}\n`);
  const commit = async (subject: string, approved = false) => {
    await git("add", "-A");
    await git("commit", "--no-verify", "-qm", subject, ...(approved ? ["-m", APPROVAL] : []));
  };
  const run = async () => {
    const result = await $`bun ${path.join(dir, "scripts/knip-budget.ts")}`
      .cwd(dir)
      .env(GIT_ENV)
      .nothrow()
      .quiet();
    return { exitCode: result.exitCode, output: `${result.stdout}${result.stderr}` };
  };

  await Promise.all(COPIED.map((file) => write(file, Bun.file(path.join(repoRoot, file)))));
  await symlink(path.join(repoRoot, "node_modules"), path.join(dir, "node_modules"));
  await write(".gitignore", "node_modules\n");
  await write(
    "package.json",
    `${JSON.stringify({ name: "fixture", private: true, type: "module", main: "src/index.ts", devDependencies: { knip: "6.41.0" } }, null, 2)}\n`,
  );
  await write("src/index.ts", 'console.log("fixture");\n');
  await write("src/dead.ts", "export const dead = 1;\n");
  await setBudget(BASE_BUDGET);
  await git("init", "-q", "-b", "main");
  await commit("trunk", true);
  await git("update-ref", "refs/remotes/origin/main", "HEAD");
  await git("checkout", "-q", "-b", "pr");
  return { dir, git, write, read, readConfig, setBudget, commit, run };
}

const passes = async (result: Promise<{ exitCode: number; output: string }>) => {
  const { exitCode, output } = await result;
  expect(exitCode, output).toBe(0);
};

const fails = async (result: Promise<{ exitCode: number; output: string }>, reason: string) => {
  const { exitCode, output } = await result;
  expect(exitCode, output).toBe(1);
  expect(output).toContain(reason);
};

type Fixture = Awaited<ReturnType<typeof fixture>>;

const addDeadFile = async (repo: Fixture) => {
  await repo.write("src/more.ts", "export const more = 1;\n");
  await repo.setBudget({ files: ["src/dead.ts", "src/more.ts"] });
};

describe("scripts/knip-budget.ts", () => {
  test("passes when the budget lists every finding", async () => {
    const repo = await fixture();
    await passes(repo.run());
  }, 30_000);

  test("fails a commit that adds a finding and its budget entry together", async () => {
    const repo = await fixture();
    await addDeadFile(repo);
    await repo.commit("raise");
    await fails(repo.run(), "raise raises the budget for files src/more.ts");
  }, 30_000);

  test("fails a commit that swaps one budget entry for another", async () => {
    const repo = await fixture();
    await rm(path.join(repo.dir, "src/dead.ts"));
    await repo.write("src/more.ts", "export const more = 1;\n");
    await repo.setBudget({ files: ["src/more.ts"] });
    await repo.commit("swap");
    await fails(repo.run(), "swap raises the budget for files src/more.ts");
  }, 30_000);

  test("fails an uncommitted raise", async () => {
    const repo = await fixture();
    await addDeadFile(repo);
    await fails(repo.run(), `Uncommitted ${BUDGET} raises the budget for files src/more.ts`);
  }, 30_000);

  test("passes a raise approved by a real Git trailer that names someone", async () => {
    const repo = await fixture();
    await addDeadFile(repo);
    await repo.commit("raise", true);
    await passes(repo.run());
  }, 30_000);

  test("fails a raise whose approval is not a real trailer naming someone", async () => {
    const messages = [
      "raise\n\nLint-Budget-Approved-By: <name>",
      "raise\n\nLint-Budget-Approved-By: >",
      "raise\n\n```text\nLint-Budget-Approved-By: Some Person\n```\n\nQuoted docs, not a trailer.",
    ];
    for (const message of messages) {
      const repo = await fixture();
      await addDeadFile(repo);
      await repo.git("add", "-A");
      await repo.git("commit", "--no-verify", "-qm", message);
      await fails(repo.run(), "raises the budget for files src/more.ts");
    }
  }, 60_000);

  test("passes a lowering without approval", async () => {
    const repo = await fixture();
    await rm(path.join(repo.dir, "src/dead.ts"));
    await repo.setBudget({});
    await repo.commit("lower");
    await passes(repo.run());
  }, 30_000);

  test("fails when the budget file is deleted", async () => {
    const repo = await fixture();
    await rm(path.join(repo.dir, BUDGET));
    await fails(repo.run(), `${BUDGET} is missing`);
    await repo.commit("delete the budget");
    await fails(repo.run(), `${BUDGET} is missing`);
  }, 30_000);

  test("fails a raise in a merge commit's own edits", async () => {
    const repo = await fixture();
    await repo.git("checkout", "-q", "-b", "side", "main");
    await repo.write("README.md", "side\n");
    await repo.commit("side");
    await repo.git("checkout", "-q", "pr");
    await repo.git("merge", "-q", "--no-ff", "--no-commit", "side");
    await addDeadFile(repo);
    await repo.commit("merge side");
    await fails(repo.run(), "merge side raises the budget for files src/more.ts");
  }, 30_000);

  test("fails a merge that resolves trunk's lowered budget back to the PR side", async () => {
    const repo = await fixture();
    await repo.write("README.md", "pr\n");
    await repo.commit("pr work");
    await repo.git("checkout", "-q", "main");
    await rm(path.join(repo.dir, "src/dead.ts"));
    await repo.setBudget({});
    await repo.commit("trunk lowers");
    await repo.git("update-ref", "refs/remotes/origin/main", "HEAD");
    await repo.git("checkout", "-q", "pr");
    await repo.git("merge", "-q", "--no-ff", "--no-commit", "main");
    await repo.git("checkout", "pr", "--", "src/dead.ts", BUDGET);
    await repo.commit("merge trunk");
    await fails(repo.run(), "merge trunk raises the budget for files src/dead.ts");
  }, 30_000);

  test("passes a clean CI merge of an approved PR into an advanced trunk", async () => {
    const repo = await fixture();
    const config = await repo.readConfig();
    await repo.write(
      "knip.json",
      `${JSON.stringify({ ...config, ignoreBinaries: [] }, null, 2)}\n`,
    );
    await repo.commit("pr config edit", true);
    await repo.git("checkout", "-q", "main");
    await repo.write("README.md", "trunk\n");
    await repo.commit("trunk work");
    await repo.git("update-ref", "refs/remotes/origin/main", "HEAD");
    await repo.git("merge", "-q", "--no-ff", "-m", "Merge pr into main", "pr");
    await passes(repo.run());
  }, 30_000);

  test("fails an unapproved commit to each knip tooling path, and passes it approved", async () => {
    const edits: [file: string, edit: (repo: Fixture) => Promise<void>][] = [
      [
        "knip.json",
        async (repo) => {
          await repo.write("src/hidden.ts", "export const hidden = 1;\n");
          const config = await repo.readConfig();
          await repo.write(
            "knip.json",
            `${JSON.stringify({ ...config, ignore: ["src/hidden.ts"] }, null, 2)}\n`,
          );
        },
      ],
      [
        "scripts/knip-budget.ts",
        async (repo) => {
          const script = await repo.read("scripts/knip-budget.ts");
          await repo.write("scripts/knip-budget.ts", `${script}\n`);
        },
      ],
    ];
    for (const [file, edit] of edits) {
      const repo = await fixture();
      await edit(repo);
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
  }, 60_000);

  test("fails uncommitted changes to the knip tooling", async () => {
    const repo = await fixture();
    const config = await repo.read("knip.json");
    await repo.write("knip.json", `${config.trimEnd()}\n\n`);
    await fails(repo.run(), "Uncommitted changes to the knip tooling");
  }, 30_000);

  test("fails when there is no merge base with origin/main", async () => {
    const repo = await fixture();
    await repo.git("update-ref", "-d", "refs/remotes/origin/main");
    await fails(repo.run(), "Cannot find the merge base with origin/main");
  }, 30_000);
});
