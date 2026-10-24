import { expect, test } from "bun:test";

async function bootFatal(kind: string, flush: string) {
  const child = Bun.spawn(
    [
      process.execPath,
      "--eval",
      `
      import { mock, spyOn } from "bun:test";
      const realTimer = globalThis.setTimeout;
      await mock.module("@myakiba/env/worker", () => ({ env: { NODE_ENV: "test" } }));
      await mock.module(${JSON.stringify(new URL("lib/evlog.ts", import.meta.url).pathname)}, () => ({
        drain: Object.assign(async () => {}, { flush: async () => {
          if (${JSON.stringify(flush)} === "stuck") return new Promise(() => {});
          if (${JSON.stringify(flush)} === "reject") throw new Error("flush refused");
          console.log("FLUSHED");
        } }),
      }));
      await mock.module(${JSON.stringify(new URL("worker.ts", import.meta.url).pathname)}, async () => {
        realTimer(() => {
          if (${JSON.stringify(kind)} === "uncaughtException") throw new Error("injected boot fatal");
          Promise.reject(new Error("injected boot fatal"));
        }, 0);
        return await new Promise(() => {});
      });
      spyOn(globalThis, "setTimeout").mockImplementation((fn) => realTimer(fn, 20));
      realTimer(() => process.exit(90), 1200);
      await import(${JSON.stringify(new URL("index.ts", import.meta.url).pathname)});
    `,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { code, output: stdout + stderr };
}

test.each([
  ["uncaughtException", "success"],
  ["unhandledRejection", "success"],
  ["unhandledRejection", "reject"],
  ["unhandledRejection", "stuck"],
])("worker logs and exits for %s during boot with %s flush", async (kind, flush) => {
  const result = await bootFatal(kind, flush);
  expect(result.code).toBe(1);
  expect(result.output).toContain(`worker.${kind}`);
  expect(result.output).toContain("injected boot fatal");
  if (flush === "success") expect(result.output).toContain("FLUSHED");
});
