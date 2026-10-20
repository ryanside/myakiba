import { redis } from "@myakiba/redis/client";
import { ping } from "@/domain/kernel";
import { readinessCheck } from "./readiness";

export const unavailableDependencies = readinessCheck(
  [
    {
      name: "postgres",
      ping,
    },
    {
      name: "redis",
      ping: async () => {
        await redis.ping();
      },
    },
  ],
  1000,
);
