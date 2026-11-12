import { expect, test } from "bun:test";
import path from "node:path";

test("the real Redis rate limit test fails naming TEST_REDIS_URL when it is missing", async () => {
  const child = Bun.spawn(
    [process.execPath, "test", "--isolate", `${import.meta.dir}/rate-limit-redis.test.ts`],
    {
      cwd: path.resolve(import.meta.dir, "../.."),
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
