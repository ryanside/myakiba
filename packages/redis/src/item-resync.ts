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

const COOLDOWN_KEY_PREFIX = "item-resync:cooldown";
const COOLDOWN_TTL_SECONDS = 3 * 24 * 60 * 60; // 3 days
const TRANSACTION_PREFIX = "xid:";

export type ItemResyncState = {
  readonly status: "idle" | "cooldown";
  readonly cooldownExpiresAt: string | null;
};

function getCooldownKey(itemId: string): string {
  return `${COOLDOWN_KEY_PREFIX}:${itemId}`;
}

/**
 * Starts the cooldown. The server passes the id of the Postgres transaction that
 * refreshed the item, so a refresh that never commits holds no cooldown.
 */
export async function setResyncCooldown(
  redis: Redis,
  itemId: string,
  transactionId?: string,
): Promise<string> {
  const now = Date.now();
  const value =
    transactionId === undefined ? now.toString() : `${TRANSACTION_PREFIX}${transactionId}`;
  await redis.set(getCooldownKey(itemId), value, "EX", COOLDOWN_TTL_SECONDS);
  return new Date(now + COOLDOWN_TTL_SECONDS * 1000).toISOString();
}

type ResyncCooldown = {
  readonly expiresAt: string;
  /** Null for a cooldown the worker set, which it set after its commit. */
  readonly transactionId: string | null;
};

export async function getResyncCooldown(
  redis: Redis,
  itemId: string,
): Promise<ResyncCooldown | null> {
  const [value, ttl] = await Promise.all([
    redis.get(getCooldownKey(itemId)),
    redis.ttl(getCooldownKey(itemId)),
  ]);
  if (value === null || ttl <= 0) return null;
  return {
    expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    transactionId: value.startsWith(TRANSACTION_PREFIX)
      ? value.slice(TRANSACTION_PREFIX.length)
      : null,
  };
}
