import { afterAll, expect, mock, spyOn, test } from "bun:test";
import { initLogger } from "evlog";
import type { DrainContext } from "evlog";

const store = new Map<string, string>();
await mock.module("@myakiba/redis/client", () => ({
  redis: {
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string) => store.set(key, value),
    del: async (key: string) => store.delete(key),
    getdel: async (key: string) => store.get(key) ?? null,
    eval: async () => 1,
  },
}));

const printed: string[] = [];
const print = (...args: unknown[]) => {
  printed.push(args.map(String).join(" "));
};
const spies = [spyOn(console, "log"), spyOn(console, "info"), spyOn(console, "error")].map((spy) =>
  spy.mockImplementation(print),
);
afterAll(() => {
  for (const spy of spies) spy.mockRestore();
});

const drained: DrainContext[] = [];
initLogger({ pretty: false });
const { createApp } = await import("./app");
const app = createApp({
  drain: (context) => {
    drained.push(context);
  },
  authDocs: undefined,
});

const TOKEN = "reset-token-that-must-not-be-logged";

test("a password reset link's token reaches neither the log nor the drain", async () => {
  await app.handle(
    new Request(
      `http://localhost/api/auth/reset-password/${TOKEN}?callbackURL=http://localhost:3001/reset-password`,
    ),
  );
  await app.handle(new Request("http://localhost/api/version"));
  await Bun.sleep(50);

  expect(drained.map(({ event }) => event.path)).toContain("/api/version");
  expect(JSON.stringify(drained)).not.toContain(TOKEN);
  expect(printed.join("\n")).toContain("/api/version");
  expect(printed.join("\n")).not.toContain(TOKEN);
});
