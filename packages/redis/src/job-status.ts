import type Redis from "ioredis";
import type { SyncJobStatus } from "@myakiba/contracts/sync/schema";
import { syncJobStatusSchema } from "@myakiba/contracts/sync/schema";
import {
  JOB_STATUS_CHANNEL_PREFIX,
  JOB_STATUS_KEY_PREFIX,
  JOB_STATUS_KEY_SUFFIX,
  JOB_STATUS_TTL_SECONDS,
} from "@myakiba/contracts/sync/constants";

export const getJobStatusSnapshotKey = (jobId: string): string =>
  `${JOB_STATUS_KEY_PREFIX}:${jobId}:${JOB_STATUS_KEY_SUFFIX}`;

export const getJobStatusChannel = (jobId: string): string =>
  `${JOB_STATUS_CHANNEL_PREFIX}${jobId}`;

export const parseJobStatusPayload = (value: string): SyncJobStatus | null => {
  try {
    const parsed = JSON.parse(value);
    const result = syncJobStatusSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
};

const WRITE_REVISION_SCRIPT = `
local cached = redis.call('GET', KEYS[1])
if cached then
  local ok, previous = pcall(cjson.decode, cached)
  if ok and tonumber(previous.revision or 0) > tonumber(ARGV[2]) then return 0 end
end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[3])
redis.call('PUBLISH', KEYS[2], ARGV[1])
return 1
`;

export const writeJobStatusSnapshotAndPublish = async (
  redis: Redis,
  jobId: string,
  status: SyncJobStatus,
): Promise<void> => {
  const serializedStatus = JSON.stringify(status);
  if (status.revision !== undefined) {
    await redis.eval(
      WRITE_REVISION_SCRIPT,
      2,
      getJobStatusSnapshotKey(jobId),
      getJobStatusChannel(jobId),
      serializedStatus,
      status.revision,
      JOB_STATUS_TTL_SECONDS,
    );
    return;
  }
  const results = await redis
    .multi()
    .set(getJobStatusSnapshotKey(jobId), serializedStatus, "EX", JOB_STATUS_TTL_SECONDS)
    .publish(getJobStatusChannel(jobId), serializedStatus)
    .exec();

  if (results === null) {
    throw new Error("FAILED_TO_WRITE_JOB_STATUS");
  }

  for (const [commandError] of results) {
    if (commandError) {
      throw commandError instanceof Error ? commandError : new Error(String(commandError));
    }
  }
};
