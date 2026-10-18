import { db } from "@myakiba/db/client";
import { redis } from "@myakiba/redis/client";
import { sql } from "drizzle-orm";
import { log } from "evlog";

const PING_TIMEOUT_MS = 1000;

type Dependency = {
  readonly name: string;
  readonly ping: () => Promise<void>;
};

const dependencies: readonly Dependency[] = [
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
];

const failedPing = async ({ name, ping }: Dependency): Promise<string | undefined> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`no answer within ${PING_TIMEOUT_MS} ms`)),
      PING_TIMEOUT_MS,
    );
  });
  try {
    await Promise.race([ping(), deadline]);
    return undefined;
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
    log.error({
      msg: "health check failed",
      dependency: name,
      reason: cause instanceof Error ? cause.message : String(cause),
    });
    return name;
  } finally {
    clearTimeout(timer);
  }
};

export const unavailableDependencies = async (): Promise<string[]> => {
  const failed = await Promise.all(dependencies.map(failedPing));
  return failed.filter((name) => name !== undefined);
};
