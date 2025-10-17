import Redis from "ioredis";
import { createMiddleware } from "hono/factory";
import type { Variables } from "../index";

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT!),
});

interface RateLimitOptions {
  maxRequests: number;
  windowSeconds: number;
  keyPrefix?: string;
}

export const createSyncRateLimit = (options: RateLimitOptions) => {
  const { maxRequests, windowSeconds, keyPrefix = "sync_rate_limit" } = options;

  return createMiddleware<{ Variables: Variables }>(async (c, next) => {
    const user = c.get("user");
    if (!user) {
      await next();
      return;
    }

    const userId = user.id;
    const key = `${keyPrefix}:sync:${userId}`;
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;

    try {
      const pipeline = redis.pipeline();

      // Remove old entries outside the window
      pipeline.zremrangebyscore(key, 0, windowStart);

      // Count requests within the current window
      pipeline.zcard(key);

      // Add current request timestamp
      pipeline.zadd(key, now, `${now}-${Math.random()}`);

      // Set expiry on the key
      pipeline.expire(key, windowSeconds);

      const results = await pipeline.exec();

      if (!results) {
        throw new Error("Redis pipeline failed");
      }

      const [, countResult] = results;
      const requestCount = countResult?.[1] as number;

      if (requestCount >= maxRequests) {
        const oldestTimestamp = await redis.zrange(key, 0, 0, "WITHSCORES");
        const retryAfter = oldestTimestamp[1]
          ? Math.ceil(
              (parseInt(oldestTimestamp[1]) + windowSeconds * 1000 - now) / 1000
            )
          : windowSeconds;

        c.header("X-RateLimit-Limit", maxRequests.toString());
        c.header("X-RateLimit-Remaining", "0");
        c.header(
          "X-RateLimit-Reset",
          new Date(now + retryAfter * 1000).toISOString()
        );
        c.header("Retry-After", retryAfter.toString());

        return c.text(
          `Too many sync requests. Please try again in ${retryAfter} seconds.`,
          429
        );
      }

      c.header("X-RateLimit-Limit", maxRequests.toString());
      c.header(
        "X-RateLimit-Remaining",
        (maxRequests - requestCount - 1).toString()
      );
      c.header(
        "X-RateLimit-Reset",
        new Date(windowStart + windowSeconds * 1000).toISOString()
      );

      await next();
    } catch (error) {
      console.error("Rate limit error:", error);
      await next();
    }
  });
};

export const csvRateLimit = createSyncRateLimit({
  maxRequests: 3,
  windowSeconds: 3600, // 60 * 60 = 1 hour
});

export const collectionRateLimit = createSyncRateLimit({
  maxRequests: 30,
  windowSeconds: 3600,
});

// More lenient for order/collection
export const orderRateLimit = createSyncRateLimit({
  maxRequests: 30,
  windowSeconds: 3600,
});
