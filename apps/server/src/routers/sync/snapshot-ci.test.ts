import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";

test("Redis snapshot tests require TEST_REDIS_URL locally", async () => {
  const directory = await mkdtemp(
    path.resolve(import.meta.dir, "../../../../../node_modules/local-redis-"),
  );
  const preload = path.join(directory, "local.ts");
  await Bun.write(
    preload,
    'if (process.env.CI) throw new Error("Local Redis regression inherited CI");',
  );
  const previous = process.env.CI;
  process.env.CI = "1";
  try {
    const child = Bun.spawn(
      [
        process.execPath,
        "test",
        "--isolate",
        "--preload",
        preload,
        `${import.meta.dir}/snapshot.test.ts`,
      ],
      {
        env: { ...process.env, CI: "", TEST_REDIS_URL: "" },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(exitCode).not.toBe(0);
    expect(stdout + stderr).toContain("TEST_REDIS_URL is required");
  } finally {
    if (previous === undefined) delete process.env.CI;
    else process.env.CI = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
