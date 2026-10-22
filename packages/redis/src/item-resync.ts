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

const COOLDOWN_KEY_PREFIX = "item-resync:cooldown";
const COOLDOWN_TTL_SECONDS = 3 * 24 * 60 * 60; // 3 days
const RUNNING_KEY_PREFIX = "item-resync:running";
const RUNNING_TTL_SECONDS = 60;

export type ItemResyncState = {
  readonly status: "idle" | "requested" | "processing" | "cooldown";
  readonly cooldownExpiresAt: string | null;
};

function getCooldownKey(itemId: string): string {
  return `${COOLDOWN_KEY_PREFIX}:${itemId}`;
}

function getRunningKey(itemId: string): string {
  return `${RUNNING_KEY_PREFIX}:${itemId}`;
}

export async function setResyncCooldown(redis: Redis, itemId: string): Promise<void> {
  await redis.set(getCooldownKey(itemId), Date.now().toString(), "EX", COOLDOWN_TTL_SECONDS);
}

export async function getResyncCooldownExpiresAt(
  redis: Redis,
  itemId: string,
): Promise<string | null> {
  const ttl = await redis.ttl(getCooldownKey(itemId));
  if (ttl <= 0) return null;
  return new Date(Date.now() + ttl * 1000).toISOString();
}

export async function markResyncRunning(redis: Redis, itemId: string): Promise<void> {
  await redis.set(getRunningKey(itemId), Date.now().toString(), "EX", RUNNING_TTL_SECONDS);
}

export async function isResyncRunning(redis: Redis, itemId: string): Promise<boolean> {
  return (await redis.exists(getRunningKey(itemId))) > 0;
}

export async function clearResyncRunning(redis: Redis, itemId: string): Promise<void> {
  await redis.del(getRunningKey(itemId));
}
