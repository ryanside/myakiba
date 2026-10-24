import { expect, mock, test } from "bun:test";

process.env.REDIS_HOST = "127.0.0.1";
process.env.REDIS_PORT = "1";
process.env.DATABASE_URL = "postgres://unused@127.0.0.1:1/unused";
await mock.module("@myakiba/redis/client", () => ({ redis: {} }));
let generations = 0;
let refuseGeneration = false;
const original = { ...(await import("better-auth")) };
await mock.module("better-auth", () => ({
  ...original,
  betterAuth: () => ({
    api: {
      generateOpenAPISchema: async () => {
        generations++;
        if (refuseGeneration) throw new Error("OpenAPI generation failed");
        return { paths: { "/ok": { get: { tags: [] } } }, components: { schemas: {} } };
      },
    },
  }),
}));
const { OpenAPI } = await import("./server");

test("importing auth does not generate OpenAPI", () => {
  expect(generations).toBe(0);
});

test("OpenAPI generation failures reach the requesting caller", async () => {
  refuseGeneration = true;
  await expect(OpenAPI.getPaths()).rejects.toThrow("OpenAPI generation failed");
});

test("OpenAPI requests retry failed generation and share the successful schema", async () => {
  refuseGeneration = false;
  const [components, paths] = await Promise.all([
    OpenAPI.components(),
    OpenAPI.getPaths("/api/auth"),
  ]);
  expect(components).toEqual({ schemas: {} });
  expect(paths).toEqual({ "/api/auth/ok": { get: { tags: ["Better Auth"] } } });
  expect(generations).toBe(2);
});
