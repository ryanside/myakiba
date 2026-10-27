import { sse } from "elysia";
import type { RequestLogger } from "evlog";
import type { Result } from "better-result";
import type {
  SyncJobStatus,
  SyncJobError,
  SyncTerminalState,
} from "@myakiba/contracts/sync/schema";
import type { StreamReadFailed } from "@/boundary/stream-read";
import { SYNC_STATUS_MESSAGES } from "@myakiba/contracts/sync/messages";
import type { SyncJobNotFound } from "@/routers/sync/errors/sync-job-not-found";
import { jobStatusSubscriptionRegistry } from "@/lib/job-status-subscription-registry";
import {
  MAX_JOB_STATUS_STREAM_DURATION_MS,
  JOB_STATUS_POLL_INTERVAL_MS,
  waitForNextJobStatusEvent,
} from "@/lib/job-status-stream";

const createTerminalJobStatus = ({
  jobId,
  startedAt,
  error,
  terminalState,
}: {
  readonly jobId: string;
  readonly startedAt: string;
  readonly error: SyncJobError;
  readonly terminalState: SyncTerminalState;
}): SyncJobStatus => ({
  jobId,
  phase: "failed",
  statusMessage: error.message,
  progress: null,
  recentItems: [],
  error,
  startedAt,
  updatedAt: new Date().toISOString(),
  terminalState,
});

export async function* streamStatus({
  log,
  jobId,
  signal,
  read,
}: {
  readonly log: RequestLogger;
  readonly jobId: string;
  readonly signal: AbortSignal;
  readonly read: () => Promise<Result<SyncJobStatus, SyncJobNotFound | StreamReadFailed>>;
}) {
  log.set({
    sync: { jobId },
  });

  const streamStartedAt = Date.now();
  const streamStartedAtIso = new Date(streamStartedAt).toISOString();
  const abortPromise = signal.aborted
    ? Promise.resolve<"aborted">("aborted")
    : new Promise<"aborted">((resolve) => {
        signal.addEventListener("abort", () => resolve("aborted"), { once: true });
      });

  const logTerminalOutcome = (terminalState: SyncTerminalState): void => {
    log.set({
      outcome: terminalState,
      result: { terminalState },
    });
  };

  const initialJobStatusRead = await read();

  if (initialJobStatusRead.isErr()) {
    const isNotFound = initialJobStatusRead.error._tag === "SyncJobNotFound";
    const message = isNotFound ? "Job not found" : "Error fetching job status";

    yield sse({
      data: createTerminalJobStatus({
        jobId,
        startedAt: streamStartedAtIso,
        error: { code: "unknown", message },
        terminalState: "error",
      }),
    });
    return;
  }

  const initialJobStatus = initialJobStatusRead.value;
  yield sse({
    data: initialJobStatus,
  });

  if (initialJobStatus.terminalState !== null) {
    logTerminalOutcome(initialJobStatus.terminalState);
    return;
  }

  let subscription;
  try {
    subscription = await jobStatusSubscriptionRegistry.subscribe(jobId);
  } catch (error) {
    const subscriptionError = error instanceof Error ? error : new Error(String(error));
    log.error(subscriptionError, {
      step: "subscribeJobStatus",
      outcome: "error",
    });
    yield sse({
      data: createTerminalJobStatus({
        jobId,
        startedAt: initialJobStatus.startedAt,
        error: {
          code: "connection_lost",
          message: SYNC_STATUS_MESSAGES.streamError,
        },
        terminalState: "error",
      }),
    });
    return;
  }

  try {
    const replayJobStatusRead = await read();

    if (replayJobStatusRead.isErr()) {
      const isNotFound = replayJobStatusRead.error._tag === "SyncJobNotFound";
      const message = isNotFound ? "Job not found" : "Error fetching job status";

      yield sse({
        data: createTerminalJobStatus({
          jobId,
          startedAt: initialJobStatus.startedAt,
          error: { code: "unknown", message },
          terminalState: "error",
        }),
      });
      return;
    }

    const replayJobStatus = replayJobStatusRead.value;
    if (
      initialJobStatus.phase !== replayJobStatus.phase ||
      initialJobStatus.statusMessage !== replayJobStatus.statusMessage ||
      initialJobStatus.updatedAt !== replayJobStatus.updatedAt ||
      initialJobStatus.terminalState !== replayJobStatus.terminalState
    ) {
      yield sse({
        data: replayJobStatus,
      });
    }

    if (replayJobStatus.terminalState !== null) {
      logTerminalOutcome(replayJobStatus.terminalState);
      return;
    }

    let latestJobStatus = replayJobStatus;
    let nextPollAt = Date.now() + JOB_STATUS_POLL_INTERVAL_MS;
    let subscriptionEventPromise = subscription.next();

    while (true) {
      const remainingMs = MAX_JOB_STATUS_STREAM_DURATION_MS - (Date.now() - streamStartedAt);

      if (remainingMs <= 0) {
        log.set({ outcome: "timeout" });
        yield sse({
          data: createTerminalJobStatus({
            jobId,
            startedAt: initialJobStatus.startedAt,
            error: {
              code: "timeout",
              message: SYNC_STATUS_MESSAGES.streamTimeout,
            },
            terminalState: "timeout",
          }),
        });
        return;
      }

      const nextEvent = await waitForNextJobStatusEvent({
        subscriptionEventPromise,
        abortPromise,
        remainingMs,
      });

      if (nextEvent.kind === "aborted") {
        log.set({ outcome: "aborted" });
        return;
      }

      if (nextEvent.kind === "timeout") {
        log.set({ outcome: "timeout" });
        yield sse({
          data: createTerminalJobStatus({
            jobId,
            startedAt: initialJobStatus.startedAt,
            error: {
              code: "timeout",
              message: SYNC_STATUS_MESSAGES.streamTimeout,
            },
            terminalState: "timeout",
          }),
        });
        return;
      }

      if (nextEvent.kind === "heartbeat") {
        if (Date.now() < nextPollAt) {
          yield sse({ data: latestJobStatus });
          continue;
        }
        nextPollAt = Date.now() + JOB_STATUS_POLL_INTERVAL_MS;
        const polledStatusRead = await read();
        if (polledStatusRead.isErr()) {
          const isNotFound = polledStatusRead.error._tag === "SyncJobNotFound";
          if (!isNotFound) {
            yield sse({ data: latestJobStatus });
            continue;
          }
          yield sse({
            data: createTerminalJobStatus({
              jobId,
              startedAt: initialJobStatus.startedAt,
              error: {
                code: "unknown",
                message: "Job not found",
              },
              terminalState: "error",
            }),
          });
          return;
        }
        const polledStatus = polledStatusRead.value;
        latestJobStatus = {
          ...polledStatus,
          recentItems:
            polledStatus.recentItems.length > 0
              ? polledStatus.recentItems
              : latestJobStatus.recentItems,
        };
        yield sse({
          data: latestJobStatus,
        });
        if (latestJobStatus.terminalState !== null) {
          logTerminalOutcome(latestJobStatus.terminalState);
          return;
        }
        continue;
      }

      if (nextEvent.event.kind === "error") {
        if (!signal.aborted) {
          log.error(nextEvent.event.error, {
            step: "jobStatusSubscription",
            outcome: "error",
          });
          yield sse({
            data: createTerminalJobStatus({
              jobId,
              startedAt: initialJobStatus.startedAt,
              error: {
                code: "connection_lost",
                message: SYNC_STATUS_MESSAGES.streamError,
              },
              terminalState: "error",
            }),
          });
        }
        return;
      }

      subscriptionEventPromise = subscription.next();
      if ((nextEvent.event.status.revision ?? 0) < (latestJobStatus.revision ?? 0)) continue;
      latestJobStatus = nextEvent.event.status;
      yield sse({
        data: latestJobStatus,
      });

      if (latestJobStatus.terminalState !== null) {
        logTerminalOutcome(latestJobStatus.terminalState);
        return;
      }
    }
  } finally {
    await subscription.unsubscribe();
  }
}
