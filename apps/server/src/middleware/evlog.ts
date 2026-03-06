import { Elysia } from "elysia";
import { createRequestLogger } from "evlog";

/**
 * Resolve Elysia's `set.status` (which may be a number, a string code,
 * or undefined) into a numeric HTTP status code.
 */
const resolveStatusCode = (status: number | string | undefined): number => {
  if (typeof status === "number") return status;
  if (typeof status === "string") {
    const parsed = parseInt(status, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 200;
};

/**
 * Elysia plugin that implements the **wide event** pattern with evlog:
 *
 * 1. `derive` — creates a request-scoped logger per request with method, path,
 *    and a unique `requestId`.  Also records `startTime` for duration.
 * 2. `onAfterResponse` — emits the wide event with status and duration.
 *
 * Route handlers enrich the event by calling `log.set({ ... })`.
 */
export const evlog = new Elysia({ name: "request-context" })
  .derive(({ request }) => {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);

    const log = createRequestLogger({
      method: request.method,
      path: url.pathname,
      requestId,
    });

    return {
      requestId,
      startTime: performance.now(),
      log,
    };
  })
  .onAfterResponse(({ log, startTime, set }) => {
    const durationMs = Math.round(performance.now() - startTime);
    const statusCode = resolveStatusCode(set.status);

    log.emit({ status: statusCode, duration: durationMs });
  })
  .as("scoped");
