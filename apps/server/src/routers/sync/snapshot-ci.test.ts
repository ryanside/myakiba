import { expect, test } from "bun:test";

for (const [label, ci] of [
  ["locally", ""],
  ["in CI", "1"],
] as const) {
  test(`Redis snapshot tests require TEST_REDIS_URL ${label}`, async () => {
    const child = Bun.spawn(
      [process.execPath, "test", "--isolate", `${import.meta.dir}/snapshot.test.ts`],
      {
        env: { ...process.env, CI: ci, TEST_REDIS_URL: "" },
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
}
