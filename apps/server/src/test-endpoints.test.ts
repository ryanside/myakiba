import { expect, test } from "bun:test";

const serverDir = new URL("..", import.meta.url).pathname;

test("server tests see only the test Redis and Postgres endpoints", () => {
  expect({
    redis: `${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
    database: process.env.DATABASE_URL,
  }).toEqual({ redis: "127.0.0.1:1", database: "postgres://unused@127.0.0.1:1/unused" });
});

test("server tests ignore Redis and Postgres endpoints exported by the shell", async () => {
  const { scripts } = await Bun.file(`${serverDir}/package.json`).json();
  const child = Bun.spawnSync(
    ["sh", "-c", `${scripts.test} "$@"`, "sh", "./src/test-endpoints.test.ts", "-t", "see only"],
    {
      cwd: serverDir,
      env: {
        ...process.env,
        REDIS_HOST: "192.0.2.55",
        REDIS_PORT: "6379",
        DATABASE_URL: "postgres://app@192.0.2.55:5432/app",
      },
    },
  );

  expect({ exitCode: child.exitCode, output: `${child.stdout}${child.stderr}` }).toMatchObject({
    exitCode: 0,
  });
});
