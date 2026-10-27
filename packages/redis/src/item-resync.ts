/**
 * Item resync cooldown keys and helpers.
 *
 * The 3-day freshness window is enforced only by a Redis TTL key. This means
 * cooldown is best-effort: if Redis data is wiped (restart without persistence,
 * FLUSHDB, etc.), items become eligible for resync earlier than intended. This
 * tradeoff avoids Postgres schema changes for per-item cooldown tracking while
 * keeping the common path fast and simple.
 */
import { withDeadline } from "@myakiba/utils/with-deadline";
import { Result } from "better-result";
import type Redis from "ioredis";
import { ResyncCooldownUnavailable } from "./errors/resync-cooldown-unavailable";

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
): Promise<Result<string, ResyncCooldownUnavailable>> {
  const now = Date.now();
  const value =
    transactionId === undefined ? now.toString() : `${TRANSACTION_PREFIX}${transactionId}`;
  const written = await Result.tryPromise({
    try: () =>
      withDeadline(() => redis.set(getCooldownKey(itemId), value, "EX", COOLDOWN_TTL_SECONDS)),
    catch: (cause) => new ResyncCooldownUnavailable({ itemId, cause }),
  });
  if (written.isErr()) return written;
  return Result.ok(new Date(now + COOLDOWN_TTL_SECONDS * 1000).toISOString());
}

type ResyncCooldown = {
  readonly expiresAt: string;
  /** Null for a cooldown the worker set, which it set after its commit. */
  readonly transactionId: string | null;
};

export async function getResyncCooldown(
  redis: Redis,
  itemId: string,
): Promise<Result<ResyncCooldown | null, ResyncCooldownUnavailable>> {
  const read = await Result.tryPromise({
    try: () =>
      withDeadline(() =>
        Promise.all([redis.get(getCooldownKey(itemId)), redis.ttl(getCooldownKey(itemId))]),
      ),
    catch: (cause) => new ResyncCooldownUnavailable({ itemId, cause }),
  });
  if (read.isErr()) return read;
  const [value, ttl] = read.value;
  if (value === null || ttl <= 0) return Result.ok(null);
  return Result.ok({
    expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    transactionId: value.startsWith(TRANSACTION_PREFIX)
      ? value.slice(TRANSACTION_PREFIX.length)
      : null,
  });
}
