import Redis from "ioredis";

export { normalizeDateString, tryCatch, type Result } from "@myakiba/utils";
import { env } from "@myakiba/env/worker";

export const createFetchOptions = (image: boolean = false) => ({
  proxy: env.HTTP_PROXY,
  tls: {
    rejectUnauthorized: false,
  },
  headers: {
    ...(!image && { "Accept-Encoding": "gzip, deflate, br" }),
  },
  signal: AbortSignal.timeout(10000),
});

export const sendMockScrapeProgress = async (
  redis: Redis,
  jobId: string,
  config: {
  readonly mockItemCount: number;
  readonly delayMs: number;
  readonly simulateFailure: boolean;
},
): Promise<void> => {
  const { mockItemCount, delayMs, simulateFailure } = config;

  for (let i = 1; i <= mockItemCount; i++) {
    await setJobStatus(redis, jobId, `Syncing...${i}/${mockItemCount}`, false);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  if (simulateFailure) {
    await setJobStatus(
      redis,
      jobId,
      `Sync failed: Failed to scrape items. Please try again. MFC might be down, or the MFC item IDs may be invalid.`,
      true,
    );
  } else {
    await setJobStatus(
      redis,
      jobId,
      `Sync completed: Synced ${mockItemCount} out of ${mockItemCount} items`,
      true,
    );
  }
};

export const setJobStatus = async (
  redis: Redis,
  jobId: string,
  status: string,
  finished: boolean,
) => {
  await redis.set(
    `job:${jobId}:status`,
    JSON.stringify({
      status: status,
      finished: finished,
      createdAt: new Date().toISOString(),
    }),
    "EX",
    60,
  );
};
