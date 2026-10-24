import { beforeEach, expect, mock, test } from "bun:test";
import { initLogger } from "evlog";
import type { DrainContext } from "evlog";

type Processor = (job: { id?: string }) => Promise<void>;

let processor: Processor | undefined;
let deleteExpired: () => Promise<{ id: string }[]> = async () => [];
let logged: DrainContext["event"][] = [];

await mock.module("@myakiba/env/worker", () => ({
  env: { REDIS_HOST: "127.0.0.1", REDIS_PORT: 6379 },
}));
await mock.module("@myakiba/db/client", () => ({
  db: { delete: () => ({ where: () => ({ returning: () => deleteExpired() }) }) },
}));
await mock.module("bullmq", () => ({
  Queue: function Queue() {
    return { on() {}, upsertJobScheduler: async () => {}, close: async () => {} };
  },
  Worker: function Worker(_name: string, run: Processor) {
    processor = run;
    return { on() {}, close: async () => {} };
  },
}));
initLogger({
  silent: true,
  drain: (context) => {
    logged.push(context.event);
  },
});
await import("./cleanup");

function runCleanup(): Promise<void> {
  if (!processor) throw new Error("cleanup.ts registered no BullMQ processor");
  return processor({ id: "cleanup-1" });
}

beforeEach(() => {
  logged = [];
});

test("resolves and logs the deleted count when the expired sync history is deleted", async () => {
  deleteExpired = async () => [{ id: "session-1" }, { id: "session-2" }];

  await expect(runCleanup()).resolves.toBeUndefined();
  expect(logged).toEqual([
    expect.objectContaining({
      action: "sync.cleanup",
      job: { id: "cleanup-1" },
      outcome: "success",
      deletedSessions: 2,
    }),
  ]);
});

test("rejects with the database error so BullMQ records the failed job, and logs it once", async () => {
  const failure = new Error("connection terminated");
  deleteExpired = () => Promise.reject(failure);

  await expect(runCleanup()).rejects.toBe(failure);
  expect(logged).toEqual([
    expect.objectContaining({
      action: "sync.cleanup",
      job: { id: "cleanup-1" },
      outcome: "error",
      error: expect.objectContaining({ name: "Error", message: "connection terminated" }),
    }),
  ]);
});
