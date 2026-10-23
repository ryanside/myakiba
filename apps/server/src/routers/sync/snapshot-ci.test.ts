import { expect, test } from "bun:test";

test("CI fails when the Redis Lua test has no Redis URL", async () => {
  const child = Bun.spawn(
    [process.execPath, "test", "--isolate", `${import.meta.dir}/snapshot.test.ts`],
    {
      env: { ...process.env, CI: "1", TEST_REDIS_URL: "" },
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
  expect(stdout + stderr).toContain("CI requires TEST_REDIS_URL");
});
