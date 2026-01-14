import { rateLimiter, type Store } from "hono-rate-limiter";
import RedisStore from "rate-limit-redis";
import Redis from "ioredis";
import type { Variables } from "../index";
import { env } from "@myakiba/env/server";

const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
});

const createSyncRateLimit = (options: {
  maxRequests: number;
  windowSeconds: number;
  keyPrefix: string;
}) =>
  rateLimiter<{ Variables: Variables }>({
    windowMs: options.windowSeconds * 1000,
    limit: options.maxRequests,
    keyGenerator: (c) => c.get("user")?.id ?? "",
    store: new RedisStore({
      sendCommand: (command: string, ...args: string[]) =>
        redis.call(command, ...args) as never,
      prefix: `${options.keyPrefix}:`,
    }) as unknown as Store<{ Variables: Variables }>,
    skip: (c) => !c.get("user"),
  });

export const csvRateLimit = createSyncRateLimit({
  maxRequests: 7,
  windowSeconds: 3600,
  keyPrefix: "csv_rate_limit",
});

export const collectionRateLimit = createSyncRateLimit({
  maxRequests: 30,
  windowSeconds: 3600,
  keyPrefix: "collection_rate_limit",
});

export const orderRateLimit = createSyncRateLimit({
  maxRequests: 30,
  windowSeconds: 3600,
  keyPrefix: "order_rate_limit",
});
