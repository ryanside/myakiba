import { EventEmitter } from "node:events";
import { expect, mock, test } from "bun:test";
import { initLogger } from "evlog";
import type { DrainContext } from "evlog";

const client = new EventEmitter();
await mock.module("ioredis", () => ({
  default: function Redis() {
    return client;
  },
}));
await mock.module("@myakiba/env/redis", () => ({
  env: { REDIS_HOST: "127.0.0.1", REDIS_PORT: 1 },
}));
const events: DrainContext["event"][] = [];
initLogger({
  silent: true,
  drain: ({ event }) => {
    events.push(event);
  },
});
await import("./client");

test("the shared Redis client reports emitted errors through evlog", () => {
  const error = new Error("Redis connection lost");
  expect(() => client.emit("error", error)).not.toThrow();
  expect(events).toEqual([
    expect.objectContaining({
      action: "redis.connection",
      outcome: "error",
      error: expect.objectContaining({ message: "Redis connection lost" }),
    }),
  ]);
});
