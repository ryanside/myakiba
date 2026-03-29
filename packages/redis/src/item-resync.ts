/**
 * Item resync cooldown keys and helpers.
 *
 * The 3-day freshness window is enforced only by a Redis TTL key. This means
 * cooldown is best-effort: if Redis data is wiped (restart without persistence,
 * FLUSHDB, etc.), items become eligible for resync earlier than intended. This
 * tradeoff avoids Postgres schema changes for per-item cooldown tracking while
 * keeping the common path fast and simple.
 */
import type Redis from "ioredis";

export const ITEM_RESYNC_QUEUE_NAME = "item-resync-queue";
export const ITEM_RESYNC_JOB_NAME = "item-resync";

const COOLDOWN_KEY_PREFIX = "item-resync:cooldown";
const COOLDOWN_TTL_SECONDS = 3 * 24 * 60 * 60; // 3 days

export type ItemResyncState = {
  readonly status: "idle" | "requested" | "processing" | "cooldown";
  readonly cooldownExpiresAt: string | null;
};

function getCooldownKey(itemId: string): string {
  return `${COOLDOWN_KEY_PREFIX}:${itemId}`;
}

export function getResyncJobId(itemId: string): string {
  return `${ITEM_RESYNC_JOB_NAME}-${itemId}`;
}

export async function setResyncCooldown(redis: Redis, itemId: string): Promise<void> {
  await redis.set(getCooldownKey(itemId), Date.now().toString(), "EX", COOLDOWN_TTL_SECONDS);
}

export async function isResyncOnCooldown(redis: Redis, itemId: string): Promise<boolean> {
  const exists = await redis.exists(getCooldownKey(itemId));
  return exists === 1;
}

export async function getResyncCooldownExpiresAt(
  redis: Redis,
  itemId: string,
): Promise<string | null> {
  const ttl = await redis.ttl(getCooldownKey(itemId));
  if (ttl <= 0) return null;
  return new Date(Date.now() + ttl * 1000).toISOString();
}
