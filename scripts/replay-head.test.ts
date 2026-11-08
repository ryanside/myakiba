import { expect, test } from "bun:test";
import { $ } from "bun";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";

test("a replay head remap replaces a deleted historical test file", async () => {
  const root = await mkdtemp(path.join(import.meta.dir, "../node_modules/replay-head-"));
  try {
    await mkdir(path.join(root, "scripts"));
    await mkdir(path.join(root, "node_modules/tmp"), { recursive: true });
    await Bun.write(path.join(root, ".gitignore"), "node_modules\n");
    await Bun.write(
      path.join(root, "package.json"),
      JSON.stringify({ name: "replay-head-fixture", scripts: { test: "bun test" } }),
    );
    await Bun.write(path.join(root, "operation.ts"), "export const answer = 1;\n");
    const source =
      'import {expect,test} from "bun:test"; import {answer} from "./operation"; test("legacy case",()=>expect(answer).toBe(2));\n';
    await Bun.write(path.join(root, "legacy.test.ts"), source);
    await $`git init --quiet`.cwd(root).quiet();
    await $`git config user.name Replay`.cwd(root).quiet();
    await $`git config user.email replay@example.invalid`.cwd(root).quiet();
    await $`bun install --ignore-scripts`.cwd(root).quiet();
    await $`git add .`.cwd(root).quiet();
    await $`git -c core.hooksPath=/dev/null commit --quiet -m base`.cwd(root).quiet();
    await Bun.write(path.join(root, "operation.ts"), "export const answer = 2;\n");
    await $`git add operation.ts`.cwd(root).quiet();
    await $`git -c core.hooksPath=/dev/null commit --quiet -m fix`.cwd(root).quiet();
    const revision = await $`git rev-parse HEAD`.cwd(root).text();
    const fix = revision.trim();
    await Bun.write(
      path.join(root, "current.test.ts"),
      source.replace("legacy case", "current case"),
    );
    await rm(path.join(root, "legacy.test.ts"));
    await $`git add .`.cwd(root).quiet();
    await $`git -c core.hooksPath=/dev/null commit --quiet -m rename`.cwd(root).quiet();
    for (const script of ["replay.ts", "replay-config.ts", "worktree-snapshot.ts"])
      await Bun.write(
        path.join(root, "scripts", script),
        Bun.file(path.join(import.meta.dir, script)),
      );
    await Bun.write(
      path.join(root, "scripts/replays.json"),
      JSON.stringify({
        test: [
          {
            fix,
            testAt: fix,
            reason: "Preserve the old harness",
            bug: "fixture returned 1",
            test: "legacy.test.ts",
            fixed: ["legacy case"],
            head: [
              { test: "current.test.ts", fixed: ["current case"], reason: "Test file renamed" },
            ],
          },
        ],
      }),
    );
    const run = Bun.spawn([process.execPath, "scripts/replay.ts", fix], {
      cwd: root,
      env: { ...process.env, TMPDIR: path.join(root, "node_modules/tmp") },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, stdout, stderr] = await Promise.all([
      run.exited,
      new Response(run.stdout).text(),
      new Response(run.stderr).text(),
    ]);
    expect({ code, output: stdout + stderr }).toMatchObject({ code: 0 });
    expect(stdout).toContain("head  current.test.ts");
    expect(stdout).not.toContain("head  legacy.test.ts");
    expect(stdout).toContain("1 fixed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);
