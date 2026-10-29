import { expect, test } from "bun:test";

test("Redis snapshot tests require TEST_REDIS_URL locally", async () => {
  const child = Bun.spawn(
    [process.execPath, "test", "--isolate", `${import.meta.dir}/snapshot.test.ts`],
    {
      env: { ...process.env, TEST_REDIS_URL: "" },
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
});
