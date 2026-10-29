import { expect, test } from "bun:test";
import { $ } from "bun";
import { mkdir, mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import path from "node:path";

async function fixture(action: string, check: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(import.meta.dir, "../node_modules/run-lifecycle-"));
  try {
    const { devDependencies }: { devDependencies: { turbo: string } } = await Bun.file(
      path.join(import.meta.dir, "../package.json"),
    ).json();
    await mkdir(path.join(root, "scripts"));
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
    // The a47b2ec2 replay needs its parent's checker import and committed Git fingerprint fixture.
    for (const file of [
      "test-run.ts",
      "run-tests.ts",
      "replay-reports.ts",
      "check-replay-coverage.ts",
    ]) {
      const source = Bun.file(path.join(import.meta.dir, file));
      if (await source.exists()) await Bun.write(path.join(root, "scripts", file), source);
    }
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
      import path from "node:path";
      const root=path.resolve(import.meta.dir,"../..");
      test("package",async()=>{${action}},20_000);
    `,
    );
    // Keep Git setup and the commit for the a47b2ec2 parent fingerprint.
    await $`git init --quiet`.cwd(root).quiet();
    await $`git config user.name Test`.cwd(root).quiet();
    await $`git config user.email test@example.invalid`.cwd(root).quiet();
    await $`bun install --ignore-scripts`.cwd(root).quiet();
    const bin = path.join(root, "node_modules/isolated-bin");
    await mkdir(bin);
    const node = Bun.which("node");
    if (!node) throw new Error("Node is required to run project Turbo");
    await symlink(process.execPath, path.join(bin, "bun"));
    await symlink(node, path.join(bin, "node"));
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
        PATH: direct ? path.join(root, "node_modules/isolated-bin") : process.env.PATH,
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
  await fixture("", async (root) => {
    await Bun.write(
      path.join(root, "scripts/replays.json"),
      JSON.stringify({
        test: [{ testAt: "a".repeat(40), test: "apps/a/cases.test.ts", fixed: ["not registered"] }],
      }),
    );
    const result = await start(root).result;
    expect(result.code).not.toBe(0);
    expect(result.output).toContain("Missing passed replay coverage");
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

async function cleanupFault(root: string) {
  await Bun.write(
    path.join(root, "node_modules/cleanup-fault.ts"),
    `
    import * as fs from "node:fs/promises";
    import {mock} from "bun:test";
    const before=[process.listenerCount("SIGINT"),process.listenerCount("SIGTERM")];
    process.on("exit",()=>console.error(
      JSON.stringify(before)===JSON.stringify([process.listenerCount("SIGINT"),process.listenerCount("SIGTERM")])
        ? "signal handlers restored" : "signal handlers leaked"));
    const original=fs.rm;
    const replacement={...fs,rm:async(target,options)=>{
      if(typeof target==="string" && /\\/\\.test-results\\/[0-9a-f-]{36}$/u.test(target))
        throw new Error("cleanup blocked");
      return original(target,options);
    }};
    mock.module("node:fs/promises",()=>replacement);
  `,
  );
  const manifest = await Bun.file(path.join(root, "package.json")).json();
  manifest.scripts.test = "bun --preload ./node_modules/cleanup-fault.ts scripts/run-tests.ts";
  await Bun.write(path.join(root, "package.json"), JSON.stringify(manifest));
}
for (const primary of [
  "success",
  "step failure",
  "coverage error",
  "SIGINT",
  "SIGTERM",
  "begin error",
] as const) {
  test(`cleanup faults preserve ${primary} and remove signal handlers`, async () => {
    const hold = primary === "SIGINT" || primary === "SIGTERM";
    await fixture(
      hold
        ? 'await Bun.write(path.join(root,"node_modules/ready"),"ready"); await new Promise(()=>{});'
        : "",
      async (root) => {
        await cleanupFault(root);
        if (primary === "step failure") {
          const manifest = await Bun.file(path.join(root, "package.json")).json();
          manifest.scripts["test:tooling"] = "sh -c 'exit 7' sh";
          await Bun.write(path.join(root, "package.json"), JSON.stringify(manifest));
        }
        if (primary === "coverage error")
          await Bun.write(
            path.join(root, "scripts/replays.json"),
            JSON.stringify({
              test: [
                { testAt: "a".repeat(40), test: "apps/a/cases.test.ts", fixed: ["not registered"] },
              ],
            }),
          );
        if (primary === "begin error")
          await Bun.write(path.join(root, "apps/a/.test-results"), "not a directory");
        const run = start(root);
        try {
          if (hold) {
            await waitFor(path.join(root, "node_modules/ready"));
            run.child.kill(primary);
          }
          const result = await run.result;
          const codes = {
            success: 0,
            "step failure": 7,
            "coverage error": 1,
            SIGINT: 130,
            SIGTERM: 143,
            "begin error": 1,
          };
          expect(result.code).toBe(codes[primary]);
          expect(result.output).toContain("signal handlers restored");
          if (primary !== "begin error")
            expect(result.output).toContain("Failed to clean test report namespaces");
          if (primary === "coverage error")
            expect(result.output).toContain("Missing passed replay coverage");
          if (primary === "begin error") {
            expect(result.output).toContain("Failed to roll back test report namespaces");
            expect(result.output).toContain("cleanup blocked");
            expect(result.output).toContain("must be a real directory");
          }
        } finally {
          stop(run.child.pid);
          await run.result;
        }
      },
    );
  }, 30_000);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  test(`${signal} wins over a failing setup and still reports its error`, async () => {
    await fixture("", async (root) => {
      const preload = path.join(root, "node_modules/setup-pause.ts");
      await Bun.write(
        preload,
        `
        import * as fs from "node:fs/promises";
        import {mock} from "bun:test";
        const original=fs.lstat;
        const gate=Promise.withResolvers();
        process.once("${signal}",()=>gate.resolve());
        const replacement={...fs,lstat:async(target,...args)=>{
          if(target===process.cwd()+"/apps/a/.test-results") {
            await Bun.write("node_modules/ready","ready");
            await gate.promise;
            throw new Error("paused setup failed");
          }
          return original(target,...args);
        }};
        mock.module("node:fs/promises",()=>replacement);
      `,
      );
      const child = Bun.spawn([process.execPath, "--preload", preload, "scripts/run-tests.ts"], {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
      });
      const result = Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      try {
        await waitFor(path.join(root, "node_modules/ready"));
        child.kill(signal);
        const [code, stdout, stderr] = await result;
        expect(code).toBe(signal === "SIGINT" ? 130 : 143);
        expect(stdout + stderr).toContain("paused setup failed");
        expect(await namespaces(root)).toEqual([]);
      } finally {
        child.kill();
        await result;
      }
    });
  }, 30_000);
}
