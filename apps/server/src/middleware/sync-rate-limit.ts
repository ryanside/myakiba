import Redis from "ioredis";
import { env } from "@myakiba/env/server";
import { auth } from "@myakiba/auth";

const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
});

interface RateLimitOptions {
  readonly maxRequests: number;
  readonly windowSeconds: number;
  readonly keyPrefix: string;
}

const createSyncRateLimitHandler = (options: RateLimitOptions) => {
  return async (context: { request: Request }) => {
    const session = await auth.api.getSession({
      headers: context.request.headers,
    });

    // Skip rate limiting if no user (unauthenticated requests)
    if (!session?.user) {
      return;
    }

    const userId = session.user.id;
    const key = `${options.keyPrefix}:${userId}`;
    const current = await redis.incr(key);

    // Set expiry on first request in the window
    if (current === 1) {
      await redis.expire(key, options.windowSeconds);
    }

    if (current > options.maxRequests) {
      const ttl = await redis.ttl(key);
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded",
          retryAfter: ttl > 0 ? ttl : options.windowSeconds,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(ttl > 0 ? ttl : options.windowSeconds),
          },
        }
      );
    }
  };
};

export const csvRateLimitHandler = createSyncRateLimitHandler({
  maxRequests: 7,
  windowSeconds: 3600,
  keyPrefix: "csv_rate_limit",
});

export const collectionRateLimitHandler = createSyncRateLimitHandler({
  maxRequests: 30,
  windowSeconds: 3600,
  keyPrefix: "collection_rate_limit",
});

export const orderRateLimitHandler = createSyncRateLimitHandler({
  maxRequests: 30,
  windowSeconds: 3600,
  keyPrefix: "order_rate_limit",
});
