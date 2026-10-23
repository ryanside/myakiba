import { expect, test } from "bun:test";
import Redis from "ioredis";
import type { SyncJobStatus } from "@myakiba/contracts/sync/schema";
import {
  getJobStatusChannel,
  getJobStatusSnapshotKey,
  parseJobStatusPayload,
  writeJobStatusSnapshotAndPublish,
} from "@myakiba/redis/job-status";

const redisUrl = process.env.TEST_REDIS_URL;

test.skipIf(!redisUrl && !process.env.CI)(
  "Redis atomically keeps and publishes only the latest committed revision",
  async () => {
    if (!redisUrl) throw new Error("CI requires TEST_REDIS_URL for the real Redis Lua test");
    const client = new Redis(redisUrl);
    const subscriber = client.duplicate();
    const jobId = `revision-test-${crypto.randomUUID()}`;
    const key = getJobStatusSnapshotKey(jobId);
    const received: number[] = [];
    const published = Promise.withResolvers<null>();
    subscriber.on("message", (_channel, raw: string) => {
      received.push(parseJobStatusPayload(raw)?.revision ?? 0);
      if (received.length === 2) published.resolve(null);
    });
    const now = new Date().toISOString();
    const snapshot = (revision: number): SyncJobStatus => ({
      revision,
      jobId,
      phase: "scraping",
      statusMessage: `Revision ${revision}`,
      progress: null,
      recentItems: [],
      error: null,
      terminalState: null,
      startedAt: now,
      updatedAt: now,
    });
    try {
      await subscriber.subscribe(getJobStatusChannel(jobId));
      await writeJobStatusSnapshotAndPublish(client, jobId, snapshot(1));
      await writeJobStatusSnapshotAndPublish(client, jobId, snapshot(3));
      await published.promise;
      await writeJobStatusSnapshotAndPublish(client, jobId, snapshot(2));
      expect(parseJobStatusPayload((await client.get(key)) ?? "")?.revision).toBe(3);
      expect(await client.ttl(key)).toBeGreaterThan(0);
      expect(received).toEqual([1, 3]);
    } finally {
      await subscriber.unsubscribe();
      await client.del(key);
      subscriber.disconnect();
      client.disconnect();
    }
  },
);
