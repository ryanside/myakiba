import { afterAll, expect, test } from "bun:test";
import { initLogger } from "evlog";
import type { DrainContext } from "evlog";

process.env.REDIS_HOST = "127.0.0.1";
process.env.REDIS_PORT = "56379";
const events: DrainContext["event"][] = [];
initLogger({
  silent: true,
  drain: ({ event }) => {
    events.push(event);
  },
});
const { redis: client } = await import("./client");
afterAll(() => client.disconnect());

test("the shared Redis client reports emitted errors through evlog", () => {
  const error = new Error("Redis connection lost");
  client.emit("error", error);
  // Nothing listens on the port, so the client's own connection errors may be logged too.
  expect(events.filter((event) => JSON.stringify(event.error).includes(error.message))).toEqual([
    expect.objectContaining({
      action: "redis.connection",
      outcome: "error",
      error: expect.objectContaining({ message: "Redis connection lost" }),
    }),
  ]);
});
