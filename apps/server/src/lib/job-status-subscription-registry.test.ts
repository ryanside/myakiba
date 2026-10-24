import { EventEmitter } from "node:events";
import { expect, mock, test } from "bun:test";
import { initLogger } from "evlog";
import type { DrainContext } from "evlog";

class Subscriber extends EventEmitter {
  async subscribe() {}
  disconnect() {}
}
const subscriber = new Subscriber();
await mock.module("@myakiba/redis/client", () => ({ redis: { duplicate: () => subscriber } }));
const events: DrainContext["event"][] = [];
initLogger({
  silent: true,
  drain: ({ event }) => {
    events.push(event);
  },
});
const { jobStatusSubscriptionRegistry } = await import("./job-status-subscription-registry");

test("the Redis subscriber logs connection errors and notifies its consumers", async () => {
  const subscription = await jobStatusSubscriptionRegistry.subscribe("test-job");
  subscriber.emit("error", new Error("Subscriber connection lost"));
  expect(await subscription.next()).toMatchObject({
    kind: "error",
    error: { reason: "redis_error" },
  });
  expect(events).toEqual([
    expect.objectContaining({
      action: "redis.connection",
      outcome: "error",
      error: expect.objectContaining({ message: "Subscriber connection lost" }),
    }),
  ]);
  await subscription.unsubscribe();
});
