import { db } from "@myakiba/db/client";
import { redis } from "@myakiba/redis/client";
import { sql } from "drizzle-orm";
import { readinessCheck } from "./readiness";

export const unavailableDependencies = readinessCheck(
  [
    {
      name: "postgres",
      ping: async () => {
        await db.execute(sql`select 1`);
      },
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
