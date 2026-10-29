import { expect, test } from "bun:test";
import { $ } from "bun";
import { mkdir, mkdtemp, readdir, rm, utimes } from "node:fs/promises";
import path from "node:path";

async function fixture(action: string, check: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(import.meta.dir, "../node_modules/run-lifecycle-"));
  try {
    const { devDependencies }: { devDependencies: { turbo: string } } = await Bun.file(
      path.join(import.meta.dir, "../package.json"),
    ).json();
    await mkdir(path.join(root, "scripts"));
    await mkdir(path.join(root, "tools/oxlint"), { recursive: true });
    await mkdir(path.join(root, "apps/a"), { recursive: true });
    await Bun.write(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "lifecycle-fixture",
        private: true,
        packageManager: "bun@1.4.4",
        workspaces: { packages: ["apps/*"] },
        devDependencies: { turbo: devDependencies.turbo },
        scripts: {
          test: "bun scripts/run-tests.ts",
          "test:tooling": "bun test ./scripts/tooling.test.ts",
        },
      }),
    );
    await Bun.write(
      path.join(root, "turbo.json"),
      JSON.stringify({ tasks: { test: { cache: false } } }),
    );
    await Bun.write(
      path.join(root, ".gitignore"),
      "node_modules\n.turbo\n.test-results/\ntest-results.xml\n",
    );
    for (const file of [
      "test-run.ts",
      "run-tests.ts",
      "check-replay-coverage.ts",
      "replay-reports.ts",
    ])
      await Bun.write(path.join(root, "scripts", file), Bun.file(path.join(import.meta.dir, file)));
    await Bun.write(
      path.join(root, "scripts/tooling.test.ts"),
      'import {test} from "bun:test"; test("tooling",()=>{});',
    );
    await Bun.write(path.join(root, "scripts/replays.json"), JSON.stringify({ test: [] }));
    await Bun.write(
      path.join(root, "apps/a/package.json"),
      JSON.stringify({ name: "a", scripts: { test: "bun test" } }),
    );
    await Bun.write(
      path.join(root, "apps/a/cases.test.ts"),
      `
      import {test} from "bun:test";
      import {$} from "bun";
      import path from "node:path";
      import {chmod} from "node:fs/promises";
      const root=path.resolve(import.meta.dir,"../..");
      test("package",async()=>{${action}},20_000);
    `,
    );
    await Bun.write(path.join(root, "input.ts"), "export const value=1;\n");
    await $`git init --quiet`.cwd(root).quiet();
    await $`git config user.name Test`.cwd(root).quiet();
    await $`git config user.email test@example.invalid`.cwd(root).quiet();
    await $`bun install --ignore-scripts`.cwd(root).quiet();
    await $`git add .`.cwd(root).quiet();
    await $`git -c core.hooksPath=/dev/null commit --quiet -m fixture`.cwd(root).quiet();
    return await check(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function start(root: string, direct = false) {
  const child = Bun.spawn(
    [process.execPath, ...(direct ? ["scripts/run-tests.ts"] : ["run", "test"])],
    {
      cwd: root,
      detached: true,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        PATH: [
          path.dirname(process.execPath),
          path.dirname(Bun.which("node") ?? "/usr/bin/node"),
          "/usr/bin",
          "/bin",
        ].join(path.delimiter),
      },
    },
  );
  const result = Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]).then(([code, stdout, stderr]) => ({ code, output: stdout + stderr }));
  return { child, result };
}
function stop(pid: number) {
  try {
    process.kill(-pid, "SIGKILL");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
  }
}
async function namespaces(root: string) {
  const groups = await Promise.all(
    [root, path.join(root, "apps/a")].map(async (dir) => {
      const parent = path.join(dir, ".test-results");
      const entries = await readdir(parent);
      return entries.map((name) => path.join(parent, name));
    }),
  );
  return groups.flat();
}
async function waitFor(file: string) {
  const deadline = Date.now() + 10_000;
  while (!(await Bun.file(file).exists())) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${file}`);
    await Bun.sleep(5);
  }
}

for (const outcome of ["pass", "package failure", "tooling failure"] as const) {
  test(`test runs remove their namespaces after ${outcome}`, async () => {
    await fixture(
      outcome === "package failure" ? 'throw new Error("package failed");' : "",
      async (root) => {
        if (outcome === "tooling failure") {
          await Bun.write(
            path.join(root, "scripts/tooling.test.ts"),
            'import {test} from "bun:test"; test("tooling",()=>{throw new Error("tooling failed");});',
          );
        }
        const result = await start(root).result;
        expect(result.code).toBe(outcome === "pass" ? 0 : 1);
        expect(await namespaces(root)).toEqual([]);
      },
    );
  }, 30_000);
}
test("test runs remove their namespaces after coverage rejection", async () => {
  await fixture('await Bun.write(path.join(root,"input.ts"),"changed");', async (root) => {
    const result = await start(root).result;
    expect(result.code).not.toBe(0);
    expect(result.output).toContain("Source changed during bun run test");
    expect(await namespaces(root)).toEqual([]);
  });
}, 30_000);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  test(`test runs remove their namespaces after ${signal}`, async () => {
    await fixture(
      'await Bun.write(path.join(root,"node_modules/ready"),"ready"); await new Promise(()=>{});',
      async (root) => {
        const run = start(root);
        try {
          await waitFor(path.join(root, "node_modules/ready"));
          run.child.kill(signal);
          expect(await run.child.exited).not.toBe(0);
          expect(await namespaces(root)).toEqual([]);
        } finally {
          stop(run.child.pid);
          await run.result;
        }
      },
    );
  }, 30_000);
}

test("concurrent test runs preserve each other's active namespaces", async () => {
  await fixture(
    `
    const id=process.pid;
    await Bun.write(path.join(root,"node_modules/ready-"+id),"ready");
    while(!(await Bun.file(path.join(root,"node_modules/release-"+id)).exists())) await Bun.sleep(5);
  `,
    async (root) => {
      const first = start(root);
      const runs = [first];
      try {
        const ready = async (count: number) => {
          const deadline = Date.now() + 10_000;
          while (true) {
            const files = await readdir(path.join(root, "node_modules"));
            const ids = files.filter((file) => file.startsWith("ready-"));
            if (ids.length === count) return ids;
            if (Date.now() > deadline) throw new Error("Concurrent tests never became ready");
            await Bun.sleep(5);
          }
        };
        const [firstId] = await ready(1);
        if (!firstId) throw new Error("First run is missing");
        runs.push(start(root));
        const ids = await ready(2);
        expect(await namespaces(root)).toHaveLength(4);
        await Bun.write(
          path.join(root, "node_modules", firstId.replace("ready-", "release-")),
          "release",
        );
        expect(await first.result).toMatchObject({ code: 0 });
        expect(await namespaces(root)).toHaveLength(2);
        for (const id of ids)
          await Bun.write(
            path.join(root, "node_modules", id.replace("ready-", "release-")),
            "release",
          );
        expect(await runs[1]?.result).toMatchObject({ code: 0 });
        expect(await namespaces(root)).toEqual([]);
      } finally {
        for (const run of runs) stop(run.child.pid);
      }
    },
  );
}, 30_000);

test("test runs prune old orphan namespaces and preserve recent siblings", async () => {
  await fixture("", async (root) => {
    const stale = "11111111-1111-4111-8111-111111111111";
    const fresh = "22222222-2222-4222-8222-222222222222";
    for (const directory of [root, path.join(root, "apps/a")]) {
      for (const name of [stale, fresh])
        await mkdir(path.join(directory, ".test-results", name), { recursive: true });
      const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
      await utimes(path.join(directory, ".test-results", stale), old, old);
    }
    expect(await start(root).result).toMatchObject({ code: 0 });
    const retained = await namespaces(root);
    expect(retained).toHaveLength(2);
    expect(retained.every((dir) => path.basename(dir) === fresh)).toBe(true);
  });
}, 30_000);

for (const change of ["staging", "scratch"] as const) {
  test(`source identity allows ${change} changes without changing test inputs`, async () => {
    const action =
      change === "staging"
        ? "await $`git add input.ts`.cwd(root);"
        : `
      await Bun.write(path.join(root,".claude/settings.local.json"),"changed");
      await Bun.write(path.join(root,"scratch.txt"),"changed");
    `;
    await fixture(action, async (root) => {
      await Bun.write(path.join(root, "input.ts"), "export const value=2;\n");
      await mkdir(path.join(root, ".claude"));
      await Bun.write(path.join(root, ".claude/settings.local.json"), "initial");
      await Bun.write(path.join(root, "scratch.txt"), "initial");
      expect(await start(root).result).toMatchObject({ code: 0 });
    });
  }, 30_000);
}
for (const file of [
  "scripts/new.ts",
  "tools/new.ts",
  "apps/a/new.ts",
  "custom.config.ts",
] as const) {
  test(`source identity rejects changed untracked test input ${file}`, async () => {
    await fixture(
      `await Bun.write(path.join(root,${JSON.stringify(file)}),"changed");`,
      async (root) => {
        await Bun.write(path.join(root, file), "initial");
        const result = await start(root).result;
        expect(result.code).not.toBe(0);
        expect(result.output).toContain("Source changed during bun run test");
      },
    );
  }, 30_000);
}
test("source identity includes filesystem modes", async () => {
  await fixture('await chmod(path.join(root,"input.ts"),0o755);', async (root) => {
    const result = await start(root).result;
    expect(result.code).not.toBe(0);
    expect(result.output).toContain("Source changed during bun run test");
  });
}, 30_000);

test("the runner resolves project turbo outside bun run", async () => {
  await fixture("", async (root) => {
    expect(await start(root, true).result).toMatchObject({ code: 0 });
  });
}, 30_000);
for (const step of ["Turbo package tests", "Tooling tests"] as const) {
  test(`the runner names ${step} and its failed exit code`, async () => {
    await fixture(
      step === "Turbo package tests" ? 'throw new Error("failed");' : "",
      async (root) => {
        if (step === "Tooling tests") {
          const manifest = await Bun.file(path.join(root, "package.json")).json();
          manifest.scripts["test:tooling"] = "sh -c 'exit 7' sh";
          await Bun.write(path.join(root, "package.json"), JSON.stringify(manifest));
        }
        const code = step === "Tooling tests" ? 7 : 1;
        const result = await start(root).result;
        expect(result.code).toBe(code);
        expect(result.output).toContain(`${step} failed with exit code ${code}`);
      },
    );
  }, 30_000);
}
