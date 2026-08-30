import type { JobStatusSubscription } from "./job-status-subscription-registry";

export const MAX_JOB_STATUS_STREAM_DURATION_MS = 10 * 60 * 1000;
// Keep upstream idle timeouts from closing a healthy but quiet SSE response.
const JOB_STATUS_HEARTBEAT_INTERVAL_MS = 5 * 1000;

type NextJobStatusEvent =
  | Readonly<{
      kind: "subscription";
      event: Awaited<ReturnType<JobStatusSubscription["next"]>>;
    }>
  | Readonly<{
      kind: "aborted";
    }>
  | Readonly<{
      kind: "heartbeat";
    }>
  | Readonly<{
      kind: "timeout";
    }>;

export const waitForNextJobStatusEvent = async ({
  subscriptionEventPromise,
  abortPromise,
  remainingMs,
}: {
  readonly subscriptionEventPromise: ReturnType<JobStatusSubscription["next"]>;
  readonly abortPromise: Promise<"aborted">;
  readonly remainingMs: number;
}): Promise<NextJobStatusEvent> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timerKind = remainingMs <= JOB_STATUS_HEARTBEAT_INTERVAL_MS ? "timeout" : "heartbeat";
  const timerDurationMs = Math.min(remainingMs, JOB_STATUS_HEARTBEAT_INTERVAL_MS);

  try {
    return await Promise.race([
      subscriptionEventPromise.then((event): NextJobStatusEvent => ({
        kind: "subscription",
        event,
      })),
      abortPromise.then((): NextJobStatusEvent => ({
        kind: "aborted",
      })),
      new Promise<NextJobStatusEvent>((resolve) => {
        timeoutId = setTimeout(() => {
          resolve({ kind: timerKind });
        }, timerDurationMs);
      }),
    ]);
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
};
