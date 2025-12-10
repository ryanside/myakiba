import Redis from "ioredis";

export { normalizeDateString, tryCatch, type Result } from "@myakiba/utils";

export const createFetchOptions = (image: boolean = false) => ({
  proxy: process.env.HTTP_PROXY,
  tls: {
    rejectUnauthorized: false,
  },
  headers: {
    ...(!image && { "Accept-Encoding": "gzip, deflate, br" }),
  },
  signal: AbortSignal.timeout(10000),
});

export const setJobStatus = async (
  redis: Redis,
  jobId: string,
  status: string,
  finished: boolean
) => {
  await redis.set(
    `job:${jobId}:status`,
    JSON.stringify({
      status: status,
      finished: finished,
      createdAt: new Date().toISOString(),
    }),
    "EX",
    60
  );
};
