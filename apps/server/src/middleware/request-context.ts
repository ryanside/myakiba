import { Elysia } from "elysia";
import { logger } from "@/lib/logger";
import type { LogFields, LogValue } from "@/lib/logger";

/**
 * A mutable bag of context that accumulates fields over the lifetime
 * of a single request.  Route handlers call `set()` to attach business
 * context; the middleware emits the complete event after the response.
 */
export class WideEvent {
  private readonly fields: Record<string, LogValue> = {};

  /** Merge additional fields into this event (additive, last-write wins). */
  set(newFields: LogFields): void {
    for (const [key, value] of Object.entries(newFields)) {
      this.fields[key] = value;
    }
  }

  /** Return a shallow copy of every field collected so far. */
  toJSON(): LogFields {
    return { ...this.fields };
  }
}

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
 * Elysia plugin that implements the **wide event** pattern:
 *
 * 1. `derive` — creates a `WideEvent` per request with method, path,
 *    and a unique `requestId`.  Also records `startTime` for duration.
 * 2. `onAfterResponse` — finalises the event (status code, duration)
 *    and emits a single structured JSON log line via the logger.
 *
 * Route handlers enrich the event by calling `wideEvent.set({ ... })`.
 *
 * Requests that result in a 5xx status are logged at `error` level;
 * everything else is logged at `info`.
 */
export const requestContext = new Elysia({ name: "request-context" })
  .derive(({ request }) => {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);

    const wideEvent = new WideEvent();
    wideEvent.set({
      method: request.method,
      path: url.pathname,
      request_id: requestId,
    });

    return {
      requestId,
      startTime: performance.now(),
      wideEvent,
    };
  })
  .onAfterResponse(({ wideEvent, startTime, set }) => {
    const durationMs = Math.round(performance.now() - startTime);
    const statusCode = resolveStatusCode(set.status);

    wideEvent.set({
      status_code: statusCode,
      duration_ms: durationMs,
    });

    const fields = wideEvent.toJSON();

    if (statusCode >= 500) {
      logger.error(fields);
    } else {
      logger.info(fields);
    }
  })
  .as("scoped");
