import { Result } from "better-result";
import type Redis from "ioredis";
import type { SyncJobStatus } from "@myakiba/contracts/sync/schema";
import { syncJobStatusSchema } from "@myakiba/contracts/sync/schema";
import { parseJson } from "@myakiba/utils/parse-json";
import { PublishJobStatusFailed } from "./errors/publish-job-status-failed";
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

export const parseJobStatusPayload = (value: string): SyncJobStatus | null =>
  parseJson(syncJobStatusSchema, value).unwrapOr(null);

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
): Promise<Result<"written" | "stale", PublishJobStatusFailed>> => {
  const serializedStatus = JSON.stringify(status);
  const failed = (cause: unknown) => new PublishJobStatusFailed({ jobId, cause });
  if (status.revision !== undefined) {
    const revision = status.revision;
    const written = await Result.tryPromise({
      try: () =>
        redis.eval(
          WRITE_REVISION_SCRIPT,
          2,
          getJobStatusSnapshotKey(jobId),
          getJobStatusChannel(jobId),
          serializedStatus,
          revision,
          JOB_STATUS_TTL_SECONDS,
        ),
      catch: failed,
    });
    return written.map((stored) => (stored === 1 ? "written" : "stale"));
  }
  const executed = await Result.tryPromise({
    try: () =>
      redis
        .multi()
        .set(getJobStatusSnapshotKey(jobId), serializedStatus, "EX", JOB_STATUS_TTL_SECONDS)
        .publish(getJobStatusChannel(jobId), serializedStatus)
        .exec(),
    catch: failed,
  });
  if (executed.isErr()) return executed;
  if (executed.value === null) return Result.err(failed("the MULTI transaction was discarded"));
  const commandError = executed.value.find(([error]) => error)?.[0];
  return commandError ? Result.err(failed(commandError)) : Result.ok("written");
};
