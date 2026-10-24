import { expect, test } from "bun:test";
import type { SyncJobStatus } from "@myakiba/contracts/sync/schema";
import { parseJobStatusPayload } from "./job-status";

const status: SyncJobStatus = {
  revision: 2,
  jobId: "job-1",
  phase: "importing",
  statusMessage: "Importing",
  progress: null,
  recentItems: [],
  error: null,
  startedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:01.000Z",
  terminalState: null,
};

test("reads a stored job status", () => {
  expect(parseJobStatusPayload(JSON.stringify(status)).unwrap()).toEqual(status);
});

test.each([
  ["text that is not JSON", '{"jobId":'],
  ["JSON that is not a job status", JSON.stringify({ ...status, phase: "lost" })],
])("answers JobStatusPayloadInvalid for %s", (_case, payload) => {
  const parsed = parseJobStatusPayload(payload);
  expect(parsed.isErr()).toBe(true);
  if (parsed.isErr())
    expect(parsed.error).toMatchObject({
      _tag: "JobStatusPayloadInvalid",
      cause: expect.anything(),
    });
});
