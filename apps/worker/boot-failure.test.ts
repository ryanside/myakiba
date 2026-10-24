import { expect, test } from "bun:test";

async function workerFailure(phase: "boot" | "running") {
  const child = Bun.spawn(
    [
      process.execPath,
      "--eval",
      `
      import { mock, spyOn } from "bun:test";
      await mock.module("@myakiba/env/worker", () => ({ env: { NODE_ENV: "test" } }));
      await mock.module(${JSON.stringify(new URL("lib/evlog.ts", import.meta.url).pathname)}, () => ({
        drain: Object.assign(async ({ event }) => {
          if (event.outcome === "error") console.log("ERROR_EVENT:" + event.action);
        }, { flush: async () => console.log("FLUSHED") }),
      }));
      await mock.module(${JSON.stringify(new URL("worker.ts", import.meta.url).pathname)}, () => {
        if (${JSON.stringify(phase)} === "boot") throw new Error("injected startup failure");
        return { closeWorker: async () => {}, redis: { status: "ready" }, workerConsumers: [] };
      });
      spyOn(Bun, "serve").mockImplementation(() => ({ stop: async () => {} }));
      setTimeout(() => process.exit(90), 1200);
      await import(${JSON.stringify(new URL("index.ts", import.meta.url).pathname)});
      setTimeout(() => { throw new Error("injected running failure"); }, 0);
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

test("a worker boot failure logs one boot error, flushes once and exits 1", async () => {
  const { code, output } = await workerFailure("boot");
  expect(code).toBe(1);
  expect(output.match(/ERROR_EVENT:[^\n]+/g)).toEqual(["ERROR_EVENT:worker.boot"]);
  expect(output.match(/FLUSHED/g)).toHaveLength(1);
  expect(output).toContain("injected startup failure");
});

test("a fatal error after worker boot is logged, flushed and exits 1", async () => {
  const { code, output } = await workerFailure("running");
  expect(code).toBe(1);
  expect(output.match(/ERROR_EVENT:[^\n]+/g)).toEqual(["ERROR_EVENT:worker.uncaughtException"]);
  expect(output.match(/FLUSHED/g)).toHaveLength(1);
  expect(output).toContain("injected running failure");
});
