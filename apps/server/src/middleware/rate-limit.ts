import { Elysia, status } from "elysia";
import Redis from "ioredis";
import { createHash } from "crypto";
import { env } from "@myakiba/env/server";
import { auth } from "@myakiba/auth";

const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
});

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
  readonly strategy: "userId" | "ipFingerprint";
}

interface RateLimitResult {
  readonly current: number;
  readonly ttl: number;
  readonly limited: boolean;
  readonly remaining: number;
}

const rateLimitConfigs = {
  csv: {
    maxRequests: 7,
    windowSeconds: 3600,
    keyPrefix: "rl:csv",
    strategy: "userId",
  },
  collection: {
    maxRequests: 30,
    windowSeconds: 3600,
    keyPrefix: "rl:collection",
    strategy: "userId",
  },
  order: {
    maxRequests: 30,
    windowSeconds: 3600,
    keyPrefix: "rl:order",
    strategy: "userId",
  },
  waitlist: {
    maxRequests: 5,
    windowSeconds: 3600,
    keyPrefix: "rl:waitlist",
    strategy: "ipFingerprint",
  },
  verifyAccess: {
    maxRequests: 15,
    windowSeconds: 900,
    keyPrefix: "rl:verify",
    strategy: "ipFingerprint",
  },
} as const satisfies Record<string, RateLimitConfig>;

type RateLimitName = keyof typeof rateLimitConfigs;

function getIpFingerprint(headers: Headers): string {
  const ip =
    headers.get("cf-connecting-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const userAgent = headers.get("user-agent") ?? "";
  const acceptLanguage = headers.get("accept-language") ?? "";

  return createHash("sha256")
    .update(`${ip}:${userAgent}:${acceptLanguage}`)
    .digest("hex")
    .slice(0, 16);
}

async function getUserId(headers: Headers): Promise<string | null> {
  const session = await auth.api.getSession({ headers });
  return session?.user.id ?? null;
}

async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const [current, ttl] = (await redis.eval(
    RATE_LIMIT_SCRIPT,
    1,
    key,
    config.maxRequests,
    config.windowSeconds
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

      // Get identifier based on strategy
      let identifier: string | null;

      if (config.strategy === "userId") {
        identifier = await getUserId(request.headers);
        // Skip rate limiting for unauthenticated requests on userId strategy
        if (!identifier) return;
      } else {
        identifier = getIpFingerprint(request.headers);
      }

      const key = `${config.keyPrefix}:${identifier}`;
      const result = await checkRateLimit(key, config);

      // Always set rate limit headers
      set.headers["X-RateLimit-Limit"] = String(config.maxRequests);
      set.headers["X-RateLimit-Remaining"] = String(result.remaining);
      set.headers["X-RateLimit-Reset"] = String(result.ttl);

      if (result.limited) {
        set.headers["Retry-After"] = String(result.ttl);
        return status(
          429,
          `Rate limit exceeded, try again in ${result.ttl} seconds`
        );
      }
    },
  }),
});
