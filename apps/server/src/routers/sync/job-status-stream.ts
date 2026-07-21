import type { JobStatusSubscription } from "./job-status-subscription-registry";

export type NextJobStatusEvent =
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
  heartbeatIntervalMs,
}: {
  readonly subscriptionEventPromise: ReturnType<JobStatusSubscription["next"]>;
  readonly abortPromise: Promise<"aborted">;
  readonly remainingMs: number;
  readonly heartbeatIntervalMs: number;
}): Promise<NextJobStatusEvent> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timerKind = remainingMs <= heartbeatIntervalMs ? "timeout" : "heartbeat";
  const timerDurationMs = Math.min(remainingMs, heartbeatIntervalMs);

  try {
    return await Promise.race([
      subscriptionEventPromise.then(
        (event): NextJobStatusEvent => ({
          kind: "subscription",
          event,
        }),
      ),
      abortPromise.then(
        (): NextJobStatusEvent => ({
          kind: "aborted",
        }),
      ),
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
