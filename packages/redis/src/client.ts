import Redis from "ioredis";
import { env } from "@myakiba/env/redis";

export const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  retryStrategy(times: number): number {
    return Math.max(Math.min(Math.exp(times), 20000), 1000);
  },
});
