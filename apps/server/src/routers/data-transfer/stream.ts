import { sse } from "elysia";
import type { RequestLogger } from "evlog";
import type { Result } from "better-result";
import type { SyncJobStatus } from "@myakiba/contracts/sync/schema";
import { jobStatusSubscriptionRegistry } from "@/lib/job-status-subscription-registry";
import {
  MAX_JOB_STATUS_STREAM_DURATION_MS,
  JOB_STATUS_POLL_INTERVAL_MS,
  waitForNextJobStatusEvent,
} from "@/lib/job-status-stream";

export async function* streamStatus({
  log,
  signal,
  read,
}: {
  readonly log: RequestLogger;
  readonly signal: AbortSignal;
  readonly read: () => Promise<Result<SyncJobStatus | null, never>>;
}) {
  const streamStartedAt = Date.now();
  const abortPromise = signal.aborted
    ? Promise.resolve<"aborted">("aborted")
    : new Promise<"aborted">((resolve) => {
        signal.addEventListener("abort", () => resolve("aborted"), { once: true });
      });

  const initialStatusRead = await read();

  const initialStatus = initialStatusRead.unwrap();
  if (initialStatus === null) {
    log.set({ outcome: "not_found" });
    return;
  }

  yield sse({ data: initialStatus });
  if (initialStatus.terminalState !== null) {
    log.set({ outcome: initialStatus.terminalState });
    return;
  }

  let subscription;
  try {
    subscription = await jobStatusSubscriptionRegistry.subscribe(initialStatus.jobId);
  } catch (error) {
    const subscriptionError = error instanceof Error ? error : new Error(String(error));
    log.error(subscriptionError, { step: "subscribeImportStatus", outcome: "error" });
    return;
  }

  try {
    const replayStatusRead = await read();
    const replayStatus = replayStatusRead.unwrap();
    if (replayStatus === null) {
      log.set({ outcome: "not_found" });
      return;
    }

    if (
      initialStatus.phase !== replayStatus.phase ||
      initialStatus.statusMessage !== replayStatus.statusMessage ||
      initialStatus.updatedAt !== replayStatus.updatedAt ||
      initialStatus.terminalState !== replayStatus.terminalState
    ) {
      yield sse({ data: replayStatus });
    }
    if (replayStatus.terminalState !== null) {
      log.set({ outcome: replayStatus.terminalState });
      return;
    }

    let latestStatus = replayStatus;
    let nextPollAt = Date.now() + JOB_STATUS_POLL_INTERVAL_MS;
    let subscriptionEventPromise = subscription.next();

    while (true) {
      const remainingMs = MAX_JOB_STATUS_STREAM_DURATION_MS - (Date.now() - streamStartedAt);
      if (remainingMs <= 0) {
        log.set({ outcome: "timeout" });
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
        return;
      }
      if (nextEvent.kind === "heartbeat") {
        if (Date.now() < nextPollAt) {
          yield sse({ data: latestStatus });
          continue;
        }
        nextPollAt = Date.now() + JOB_STATUS_POLL_INTERVAL_MS;
        const polledStatusRead = await read();
        const polledStatus = polledStatusRead.unwrap();
        if (polledStatus === null) {
          log.set({ outcome: "not_found" });
          return;
        }
        latestStatus = polledStatus;
        yield sse({ data: latestStatus });
        if (latestStatus.terminalState !== null) {
          log.set({ outcome: latestStatus.terminalState });
          return;
        }
        continue;
      }
      if (nextEvent.event.kind === "error") {
        log.error(nextEvent.event.error, {
          step: "importStatusSubscription",
          outcome: "error",
        });
        return;
      }

      latestStatus = nextEvent.event.status;
      yield sse({ data: latestStatus });
      if (latestStatus.terminalState !== null) {
        log.set({ outcome: latestStatus.terminalState });
        return;
      }

      subscriptionEventPromise = subscription.next();
    }
  } finally {
    await subscription.unsubscribe();
  }
}
