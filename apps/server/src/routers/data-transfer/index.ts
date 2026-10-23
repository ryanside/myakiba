import { privateApi } from "@/boundary/private-api";
import { sse, ElysiaCustomStatusResponse } from "elysia";
import {
  dataTransferImportItemFailureSchema,
  dataTransferImportItemUploadSchema,
  dataTransferImportRequestSchema,
  dataTransferImportRunSchema,
} from "@myakiba/contracts/data-transfer/schema";
import { serve } from "@/domain/kernel";
import { rateLimit } from "@/middleware/rate-limit";
import { verifiedEmail } from "@/middleware/verified-email";
import { jobStatusSubscriptionRegistry } from "@/lib/job-status-subscription-registry";
import {
  MAX_JOB_STATUS_STREAM_DURATION_MS,
  JOB_STATUS_POLL_INTERVAL_MS,
  waitForNextJobStatusEvent,
} from "@/lib/job-status-stream";
import { DataTransfer } from "./module";

const dataTransferRouter = privateApi("/data-transfer")
  .use(rateLimit)
  .use(verifiedEmail)
  .get("/export", (ctx) => serve(ctx, DataTransfer.export, {}), { auth: true })
  .get("/imports/current", (ctx) => serve(ctx, DataTransfer.current, {}), { auth: true })
  .delete("/imports/current", (ctx) => serve(ctx, DataTransfer.remove, {}), { auth: true })
  .get(
    "/imports/current/status",
    async function* (ctx) {
      const { user, log, request } = ctx;
      log.set({
        action: "dataTransfer.importStatus",
        user: { id: user.id },
      });

      const streamStartedAt = Date.now();
      const abortPromise = request.signal.aborted
        ? Promise.resolve<"aborted">("aborted")
        : new Promise<"aborted">((resolve) => {
            request.signal.addEventListener("abort", () => resolve("aborted"), { once: true });
          });

      const initialStatus = await serve(ctx, DataTransfer.status, {});

      if (initialStatus instanceof ElysiaCustomStatusResponse) {
        const initialStatusError = new Error(String(initialStatus.response));
        log.error(initialStatusError, { step: "getImportJobStatus", outcome: "error" });
        return;
      }
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
        const replayStatus = await serve(ctx, DataTransfer.status, {});
        if (replayStatus instanceof ElysiaCustomStatusResponse) {
          const replayStatusError = new Error(String(replayStatus.response));
          log.error(replayStatusError, { step: "replayImportStatus", outcome: "error" });
          return;
        }
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

          if (nextEvent.kind === "aborted") return;
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
            const polledStatus = await serve(ctx, DataTransfer.status, {});
            if (polledStatus instanceof ElysiaCustomStatusResponse) {
              const polledStatusError = new Error(String(polledStatus.response));
              log.error(polledStatusError, { step: "pollImportStatus", outcome: "error" });
              yield sse({ data: latestStatus });
              continue;
            }
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
    },
    {
      auth: true,
    },
  )
  .post("/imports", (ctx) => serve(ctx, DataTransfer.start, ctx.body), {
    auth: true,
    body: dataTransferImportRequestSchema,
  })
  .post("/imports/current/retry", (ctx) => serve(ctx, DataTransfer.retry, {}), {
    auth: true,
  })
  .post(
    "/imports/current/items",
    async (ctx) => {
      const result = await serve(ctx, DataTransfer.complete, ctx.body);
      if (result instanceof ElysiaCustomStatusResponse) return result;
      return serve(ctx, DataTransfer.completeResponse, result);
    },
    {
      auth: true,
      verifiedEmail: true,
      rateLimit: "mfcIngest",
      body: dataTransferImportItemUploadSchema,
    },
  )
  .post("/imports/current/items/failure", (ctx) => serve(ctx, DataTransfer.failure, ctx.body), {
    auth: true,
    body: dataTransferImportItemFailureSchema,
    rateLimit: "syncFailure",
  })
  .post("/imports/current/interrupt", (ctx) => serve(ctx, DataTransfer.interrupt, ctx.body), {
    auth: true,
    body: dataTransferImportRunSchema,
  })
  .post("/imports/current/heartbeat", (ctx) => serve(ctx, DataTransfer.heartbeat, ctx.body), {
    auth: true,
    body: dataTransferImportRunSchema,
  });

export default dataTransferRouter;
