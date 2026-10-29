import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";

test("the local Redis prerequisite subprocess clears inherited CI", async () => {
  const root = path.resolve(import.meta.dir, "..");
  const directory = await mkdtemp(path.join(root, "node_modules/redis-environment-"));
  try {
    const preload = path.join(directory, "observe.ts");
    await Bun.write(
      preload,
      `
      import {spyOn} from "bun:test";
      const spawn = Bun.spawn;
      spyOn(Bun,"spawn").mockImplementation((command,options)=>{
        if(options?.env?.TEST_REDIS_URL === "" && options.env.CI)
          throw new Error("Local Redis subprocess inherited CI");
        return spawn(command,options);
      });
    `,
    );
    const child = Bun.spawn(
      [
        process.execPath,
        "test",
        "--isolate",
        "--preload",
        preload,
        "./src/routers/sync/snapshot-ci.test.ts",
      ],
      {
        cwd: path.join(root, "apps/server"),
        env: { ...process.env, CI: "1" },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect({ code, output: stdout + stderr }).toMatchObject({ code: 0 });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
