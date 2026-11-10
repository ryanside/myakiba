import { Elysia, status } from "elysia";
import { redis } from "@myakiba/redis/client";
import { auth } from "@myakiba/auth/server";

const RATE_LIMIT_SCRIPT = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])

local current = redis.call('INCR', key)
if current == 1 then
  redis.call('EXPIRE', key, window)
end

local ttl = redis.call('TTL', key)
return {current, ttl}
`;

interface RateLimitConfig {
  readonly maxRequests: number;
  readonly windowSeconds: number;
  readonly keyPrefix: string;
}

interface RateLimitResult {
  readonly current: number;
  readonly ttl: number;
  readonly limited: boolean;
  readonly remaining: number;
}

const rateLimitConfigs = {
  mfcIngest: {
    maxRequests: 2000,
    windowSeconds: 3600,
    keyPrefix: "rl:mfc-ingest",
  },
  itemResync: {
    maxRequests: 60,
    windowSeconds: 3600,
    keyPrefix: "rl:item-resync",
  },
  addCommit: {
    maxRequests: 120,
    windowSeconds: 3600,
    keyPrefix: "rl:add-commit",
  },
} as const satisfies Record<string, RateLimitConfig>;

type RateLimitName = keyof typeof rateLimitConfigs;

async function getUserId(headers: Headers): Promise<string | null> {
  const session = await auth.api.getSession({ headers });
  return session?.user.id ?? null;
}

async function checkRateLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
  const [current, ttl] = (await redis.eval(
    RATE_LIMIT_SCRIPT,
    1,
    key,
    config.maxRequests,
    config.windowSeconds,
  )) as [number, number];

  return {
    current,
    ttl: ttl > 0 ? ttl : config.windowSeconds,
    limited: current > config.maxRequests,
    remaining: Math.max(0, config.maxRequests - current),
  };
}

export const rateLimit = new Elysia({ name: "rate-limit" }).macro({
  rateLimit: (name: RateLimitName) => ({
    async beforeHandle({ request, set }) {
      const config = rateLimitConfigs[name];
      const identifier = await getUserId(request.headers);
      if (!identifier) return;

      const key = `${config.keyPrefix}:${identifier}`;
      const result = await checkRateLimit(key, config);

      set.headers["X-RateLimit-Limit"] = String(config.maxRequests);
      set.headers["X-RateLimit-Remaining"] = String(result.remaining);
      set.headers["X-RateLimit-Reset"] = String(result.ttl);

      if (result.limited) {
        set.headers["Retry-After"] = String(result.ttl);
        return status(429, `Rate limit exceeded, try again in ${result.ttl} seconds`);
      }
    },
  }),
});
