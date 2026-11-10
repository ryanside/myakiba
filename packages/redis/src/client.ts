import { logConnectionError } from "./log-connection-error";
import Redis from "ioredis";
import { env } from "@myakiba/env/redis";

export const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD,
  retryStrategy(times: number): number {
    return Math.max(Math.min(Math.exp(times), 20_000), 1000);
  },
});

redis.on("error", logConnectionError);
