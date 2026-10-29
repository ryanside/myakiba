import { expect, test } from "bun:test";
import { $ } from "bun";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import path from "node:path";

type Mode = "standalone" | "partial" | "source" | "revision" | "reuse";
async function fixture(mode: Mode) {
  const root = await mkdtemp(path.join(import.meta.dir, "../node_modules/test-run-"));
  try {
    await mkdir(path.join(root, "scripts"));
    await mkdir(path.join(root, "tools/oxlint"), { recursive: true });
    await mkdir(path.join(root, "apps/a"), { recursive: true });
    const { scripts }: { scripts: { test: string; "test:tooling"?: string } } = await Bun.file(
      path.join(import.meta.dir, "../package.json"),
    ).json();
    await Bun.write(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "run-fixture",
        private: true,
        packageManager: "bun@1.4.4",
        workspaces: { packages: ["apps/*"] },
        scripts,
      }),
    );
    await Bun.write(
      path.join(root, "turbo.json"),
      JSON.stringify({ tasks: { test: { cache: false } } }),
    );
    await Bun.write(
      path.join(root, ".gitignore"),
      "node_modules\n.turbo\ntest-results.xml\n.test-results/\n",
    );
    for (const file of [
      "check-replay-coverage.ts",
      "replay-reports.ts",
      "run-tests.ts",
      "test-run.ts",
    ]) {
      const source = Bun.file(path.join(import.meta.dir, file));
      if (await source.exists()) await Bun.write(path.join(root, "scripts", file), source);
    }
    await Bun.write(
      path.join(root, "scripts/tooling.test.ts"),
      'import {test} from "bun:test"; test("tooling passed",()=>{});',
    );
    await Bun.write(
      path.join(root, "apps/a/package.json"),
      JSON.stringify({ name: "a", scripts: { test: "bun test" } }),
    );
    let action = "";
    if (mode === "source")
      action =
        'await Bun.write(import.meta.path, await Bun.file(import.meta.path).text() + "\\n// source changed\\n");';
    if (mode === "revision")
      action = "await $`git -c core.hooksPath=/dev/null commit --allow-empty --quiet -m changed`;";
    const source = `import {test} from "bun:test"; import {$} from "bun"; test("passed case",async()=>{${action}});`;
    await Bun.write(path.join(root, "apps/a/cases.test.ts"), source);
    const partial = mode === "partial" || mode === "standalone";
    if (partial) {
      await mkdir(path.join(root, "apps/b"));
      await Bun.write(
        path.join(root, "apps/b/package.json"),
        JSON.stringify({ name: "b", scripts: { test: "true" } }),
      );
      await Bun.write(
        path.join(root, "apps/b/cases.test.ts"),
        'import {test} from "bun:test"; test("passed case",()=>{});',
      );
      const seed = Bun.spawn(
        [
          process.execPath,
          "test",
          "./cases.test.ts",
          "--reporter=junit",
          "--reporter-outfile=test-results.xml",
        ],
        { cwd: path.join(root, "apps/b"), stdout: "pipe", stderr: "pipe" },
      );
      await Promise.all([
        seed.exited,
        new Response(seed.stdout).text(),
        new Response(seed.stderr).text(),
      ]);
      await Bun.write(
        path.join(root, "apps/b/cases.test.ts"),
        'import {test} from "bun:test"; test.skip("passed case",()=>{});',
      );
    }
    await Bun.write(
      path.join(root, "scripts/replays.json"),
      JSON.stringify({
        test: [
          {
            test: `apps/${partial ? "b" : "a"}/cases.test.ts`,
            fixed: ["passed case"],
            testAt: "b".repeat(40),
          },
        ],
      }),
    );
    await $`git init --quiet`.cwd(root).quiet();
    await $`git config user.name Run`.cwd(root).quiet();
    await $`git config user.email run@example.invalid`.cwd(root).quiet();
    await $`bun install --ignore-scripts`.cwd(root).quiet();
    await mkdir(path.join(root, "node_modules/.bin"), { recursive: true });
    await symlink(
      path.resolve(import.meta.dir, "../node_modules/.bin/turbo"),
      path.join(root, "node_modules/.bin/turbo"),
    );
    await $`git add .`.cwd(root).quiet();
    await $`git -c core.hooksPath=/dev/null commit --quiet -m source`.cwd(root).quiet();
    const run = async (args: string[]) => {
      const child = Bun.spawn([process.execPath, ...args], {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
      });
      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      return { code, output: stdout + stderr };
    };
    if (mode === "standalone") return await run(["scripts/check-replay-coverage.ts"]);
    const full = await run(["run", "test"]);
    if (mode !== "reuse") return full;
    expect(full).toMatchObject({ code: 0 });
    return await run(["scripts/check-replay-coverage.ts"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

for (const mode of ["standalone", "partial", "source", "revision", "reuse"] as const) {
  test(`coverage rejects ${mode} reports outside the current full run and source`, async () => {
    const run = await fixture(mode);
    expect(run).not.toMatchObject({ code: 0 });
    expect(run.output).toContain("bun run test");
  }, 30_000);
}
