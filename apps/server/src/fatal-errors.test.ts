import { expect, test } from "bun:test";

async function bootFatal(kind: string, flush: string) {
  const child = Bun.spawn(
    [
      process.execPath,
      "--env-file=test.env",
      "--eval",
      `
    import { mock, spyOn } from "bun:test";
    import { Elysia } from "elysia";
    process.env.REDIS_HOST = "127.0.0.1";
    process.env.REDIS_PORT = "1";
    process.env.DATABASE_URL = "postgres://unused@127.0.0.1:1/unused";
    process.env.OPENAPI_AUTH_DOCS = "true";
    process.env.POSTHOG_API_KEY = "test-key";
    const realSetTimeout = globalThis.setTimeout;
    spyOn(globalThis, "setTimeout").mockImplementation((fn) => realSetTimeout(fn, 20));
    await mock.module("evlog/posthog", () => ({ createPostHogDrain: () => async () => {} }));
    await mock.module("evlog/pipeline", () => ({ createDrainPipeline: () => () => Object.assign(async () => {}, {
      flush: async () => {
        if (${JSON.stringify(flush)} === "stuck") return await new Promise(() => {});
        if (${JSON.stringify(flush)} === "reject") throw new Error("flush refused");
        console.log("FLUSHED");
      },
    }) }));
    await mock.module("@myakiba/auth/server", () => ({ auth: {}, hasSessionCookie: () => false, OpenAPI: {
      components: async () => ({}), getPaths: () => {
        realSetTimeout(() => {
          if (${JSON.stringify(kind)} === "uncaughtException") throw new Error("injected boot fatal");
          Promise.reject(new Error("injected boot fatal"));
        }, 0);
        return new Promise(() => {});
      },
    } }));
    await mock.module(${JSON.stringify(new URL("routes.ts", import.meta.url).pathname)}, () => ({ routes: new Elysia() }));
    realSetTimeout(() => process.exit(90), 1200);
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
])("server logs and exits for %s during boot with %s flush", async (kind, flush) => {
  const result = await bootFatal(kind, flush);
  expect(result.code).toBe(1);
  expect(result.output).toContain(`server.${kind}`);
  expect(result.output).toContain("injected boot fatal");
  if (flush === "success") expect(result.output).toContain("FLUSHED");
});
