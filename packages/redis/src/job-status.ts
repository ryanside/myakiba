import type Redis from "ioredis";
import {
  JOB_STATUS_CHANNEL_PREFIX,
  JOB_STATUS_KEY_PREFIX,
  JOB_STATUS_KEY_SUFFIX,
  JOB_STATUS_TTL_SECONDS,
} from "@myakiba/constants";

type JobStatusTerminalState = "success" | "error" | "timeout";

type JobStatusPayload = Readonly<{
  status: string;
  finished: boolean;
  createdAt: string;
  terminalState: JobStatusTerminalState | null;
}>;

const ISO_DATETIME_UTC_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const JOB_STATUS_TERMINAL_STATES: ReadonlySet<JobStatusTerminalState> = new Set([
  "success",
  "error",
  "timeout",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isJobStatusTerminalState = (value: unknown): value is JobStatusTerminalState =>
  typeof value === "string" && JOB_STATUS_TERMINAL_STATES.has(value as JobStatusTerminalState);

const isIsoDatetimeUtc = (value: unknown): value is string =>
  typeof value === "string" && ISO_DATETIME_UTC_REGEX.test(value);

const normalizeJobStatusPayload = (value: unknown): JobStatusPayload | null => {
  if (!isRecord(value)) {
    return null;
  }

  const terminalStateValue = value.terminalState;
  const terminalState = terminalStateValue === undefined ? null : terminalStateValue;

  if (
    typeof value.status !== "string" ||
    typeof value.finished !== "boolean" ||
    !isIsoDatetimeUtc(value.createdAt) ||
    !(terminalState === null || isJobStatusTerminalState(terminalState))
  ) {
    return null;
  }

  return {
    status: value.status,
    finished: value.finished,
    createdAt: value.createdAt,
    terminalState,
  };
};

export const getJobStatusSnapshotKey = (jobId: string): string =>
  `${JOB_STATUS_KEY_PREFIX}:${jobId}:${JOB_STATUS_KEY_SUFFIX}`;

export const getJobStatusChannel = (jobId: string): string =>
  `${JOB_STATUS_CHANNEL_PREFIX}${jobId}`;

export const parseJobStatusPayload = (value: string): JobStatusPayload | null => {
  try {
    const parsedJson: unknown = JSON.parse(value);
    return normalizeJobStatusPayload(parsedJson);
  } catch {
    return null;
  }
};

export const serializeJobStatusPayload = (status: JobStatusPayload): string => {
  const validatedStatus = normalizeJobStatusPayload(status);

  if (validatedStatus === null) {
    throw new Error("INVALID_JOB_STATUS_PAYLOAD");
  }

  return JSON.stringify(validatedStatus);
};

export const writeJobStatusSnapshotAndPublish = async (
  redis: Redis,
  jobId: string,
  status: JobStatusPayload,
): Promise<void> => {
  const serializedStatus = serializeJobStatusPayload(status);
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
      throw commandError;
    }
  }
};
