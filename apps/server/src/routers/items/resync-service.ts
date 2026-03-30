import { Queue } from "bullmq";
import { createLogger } from "evlog";
import { env } from "@myakiba/env/server";
import { redis } from "@myakiba/redis/client";
import {
  getResyncCooldownExpiresAt,
  getResyncJobId,
  ITEM_RESYNC_JOB_NAME,
  ITEM_RESYNC_QUEUE_NAME,
  type ItemResyncState,
} from "@myakiba/redis/item-resync";
import { db } from "@myakiba/db/client";
import { item } from "@myakiba/db/schema/figure";
import { eq } from "drizzle-orm";

const itemResyncQueue = new Queue(ITEM_RESYNC_QUEUE_NAME, {
  connection: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    enableOfflineQueue: false,
  },
});

itemResyncQueue.on("error", (error: Error) => {
  const queueLog = createLogger({
    action: "item-resync.queue",
    outcome: "error",
    queue: { name: ITEM_RESYNC_QUEUE_NAME },
  });
  queueLog.error(error);
  queueLog.emit();
});

type ResyncableItem = {
  readonly id: string;
  readonly externalId: number;
  readonly source: "mfc" | "custom";
};

async function deriveResyncStatus(itemId: string): Promise<ItemResyncState> {
  const job = await itemResyncQueue.getJob(getResyncJobId(itemId));

  if (job) {
    const state = await job.getState();

    if (state === "waiting" || state === "delayed" || state === "prioritized") {
      return { status: "requested", cooldownExpiresAt: null };
    }

    if (state === "active") {
      return { status: "processing", cooldownExpiresAt: null };
    }
  }

  const cooldownExpiresAt = await getResyncCooldownExpiresAt(redis, itemId);
  if (cooldownExpiresAt) {
    return { status: "cooldown", cooldownExpiresAt };
  }

  return { status: "idle", cooldownExpiresAt: null };
}

class ItemResyncService {
  async validateItemForResync(itemId: string): Promise<ResyncableItem> {
    const [row] = await db
      .select({ id: item.id, externalId: item.externalId, source: item.source })
      .from(item)
      .where(eq(item.id, itemId));

    if (!row) {
      throw new Error("ITEM_NOT_FOUND");
    }

    if (row.source !== "mfc" || row.externalId === null) {
      throw new Error("ITEM_NOT_RESYNCABLE");
    }

    return { id: row.id, externalId: row.externalId, source: row.source };
  }

  async getResyncStatus(itemId: string): Promise<ItemResyncState> {
    return deriveResyncStatus(itemId);
  }

  async requestResync(itemId: string, externalId: number): Promise<ItemResyncState> {
    const currentState = await deriveResyncStatus(itemId);

    if (currentState.status !== "idle") {
      throw new Error(`RESYNC_BLOCKED_${currentState.status.toUpperCase()}`);
    }

    const job = await itemResyncQueue.add(
      ITEM_RESYNC_JOB_NAME,
      { itemId, externalId },
      {
        jobId: getResyncJobId(itemId),
        removeOnComplete: true,
        removeOnFail: true,
      },
    );

    if (!job?.id) {
      throw new Error("FAILED_TO_ENQUEUE_RESYNC");
    }

    return { status: "requested", cooldownExpiresAt: null };
  }
}

export default new ItemResyncService();
