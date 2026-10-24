import { expect, test } from "bun:test";

const entry = new URL("index.ts", import.meta.url).pathname;

async function shutdownProcess(stage: string, mode: string) {
  const child = Bun.spawn(
    [
      process.execPath,
      "--eval",
      `
    import { mock, spyOn } from "bun:test";
    const stage = ${JSON.stringify(stage)};
    const mode = ${JSON.stringify(mode)};
    const fail = () => {
      if (mode === "stuck") return new Promise(() => {});
      throw new Error("injected " + stage + " failure");
    };
    await mock.module("@myakiba/env/worker", () => ({ env: { NODE_ENV: "test" } }));
    await mock.module(${JSON.stringify(new URL("worker.ts", import.meta.url).pathname)}, () => ({
      closeWorker: async () => { if (stage === "consumers") await fail(); },
      redis: { status: "ready" }, workerConsumers: [],
    }));
    await mock.module(${JSON.stringify(new URL("lib/evlog.ts", import.meta.url).pathname)}, () => ({
      drain: Object.assign(async () => {}, { flush: async () => { if (stage === "flush") await fail(); } }),
    }));
    spyOn(Bun, "serve").mockImplementation(() => ({
      stop: () => stage === "health" ? fail() : Promise.resolve(),
    }));
    const realSetTimeout = globalThis.setTimeout;
    spyOn(globalThis, "setTimeout").mockImplementation((callback) => realSetTimeout(callback, 20));
    realSetTimeout(() => process.exit(90), 1200);
    await import(${JSON.stringify(entry)});
    process.emit("SIGTERM");
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
  ["health", "throw"],
  ["health", "stuck"],
  ["consumers", "throw"],
  ["consumers", "stuck"],
  ["flush", "throw"],
  ["flush", "stuck"],
])("worker shutdown exits nonzero without hanging when %s %s", async (stage, mode) => {
  const result = await shutdownProcess(stage, mode);
  expect(result.code).toBe(1);
  expect(result.output).toContain("WorkerShutdownFailed");
  expect(result.output).toContain(stage);
});

test("worker shutdown exits zero after all stages succeed", async () => {
  const result = await shutdownProcess("none", "success");
  expect(result.code).toBe(0);
});
