import { privateApi } from "@/boundary/private-api";
import { ElysiaCustomStatusResponse, sse } from "elysia";
import * as z from "zod";
import { rateLimit } from "@/middleware/rate-limit";
import {
  itemSyncSchema,
  collectionSyncSchema,
  internalCsvItemSchema,
  orderSyncSchema,
  syncItemFailureSchema,
  syncItemUploadSchema,
  syncOrderItemsSchema,
  syncRunSchema,
} from "./model";
import type { SyncJobError, SyncTerminalState } from "@myakiba/contracts/sync/schema";
import type { SyncJobStatus } from "./model";
import { SYNC_STATUS_MESSAGES } from "@myakiba/contracts/sync/messages";
import { serve } from "@/domain/kernel";
import { Sync, SyncRuns } from "./module";
import type { plannedSync } from "./plan";
import {
  SYNC_SESSION_ITEM_STATUSES,
  SYNC_SESSION_STATUSES,
  SYNC_TYPES,
} from "@myakiba/contracts/shared/constants";
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

const sessionParams = z.object({ id: z.string() });

type Completion =
  | typeof Sync.completeCsv
  | typeof Sync.completeOrder
  | typeof Sync.completeOrderItem
  | typeof Sync.completeCollection;

type SyncPlan = ReturnType<typeof plannedSync>;

async function savePlan<C extends Completion>(
  ctx: Parameters<typeof serve>[0],
  plan: SyncPlan,
  complete: C,
): Promise<
  SyncPlan["response"] | ElysiaCustomStatusResponse<500, C["failure"] | typeof Sync.start.failure>
> {
  const saved = plan.response.jobId
    ? await serve(ctx, Sync.start, plan)
    : await serve(ctx, complete, plan.complete);
  return saved === null ? plan.response : saved;
}

const syncRouter = privateApi("/sync")
  .use(rateLimit)
  .post(
    "/item",
    async (ctx) => {
      const plan = await serve(ctx, Sync.planItem, {
        body: ctx.body,
        emailVerified: ctx.user.emailVerified,
      });
      if (plan instanceof ElysiaCustomStatusResponse) return plan;
      if (plan.response.jobId) {
        const started = await serve(ctx, Sync.start, plan);
        if (started !== null) return started;
      } else {
        const created = await serve(ctx, Sync.createSession, plan.session);
        if (created !== null) return created;
        const completed = await serve(ctx, Sync.completeItemSession, {
          id: plan.session.id,
          statusMessage: plan.response.status,
        });
        if (completed !== null) return completed;
      }
      return plan.response;
    },
    { body: itemSyncSchema, auth: true, rateLimit: "item" },
  )
  .post(
    "/csv",
    async (ctx) => {
      const plan = await serve(ctx, Sync.planCsv, {
        body: ctx.body,
        emailVerified: ctx.user.emailVerified,
      });
      if (plan instanceof ElysiaCustomStatusResponse) return plan;
      return savePlan(ctx, plan, Sync.completeCsv);
    },
    {
      body: z.array(internalCsvItemSchema.omit({ collectionId: true })).min(1),
      auth: true,
      rateLimit: "csv",
    },
  )
  .post(
    "/order",
    async (ctx) => {
      const plan = await serve(ctx, Sync.planOrder, {
        body: ctx.body,
        emailVerified: ctx.user.emailVerified,
      });
      if (plan instanceof ElysiaCustomStatusResponse) return plan;
      return savePlan(ctx, plan, Sync.completeOrder);
    },
    {
      body: orderSyncSchema,
      auth: true,
      rateLimit: "order",
    },
  )
  .post(
    "/order-item",
    async (ctx) => {
      const order = await serve(ctx, Sync.order, {
        body: ctx.body,
        emailVerified: ctx.user.emailVerified,
      });
      if (order instanceof ElysiaCustomStatusResponse) return order;
      const plan = await serve(ctx, Sync.planOrderItem, { body: ctx.body, order });
      if (plan instanceof ElysiaCustomStatusResponse) return plan;
      return savePlan(ctx, plan, Sync.completeOrderItem);
    },
    {
      body: syncOrderItemsSchema,
      auth: true,
      rateLimit: "order",
    },
  )
  .post(
    "/collection",
    async (ctx) => {
      const plan = await serve(ctx, Sync.planCollection, {
        body: ctx.body,
        emailVerified: ctx.user.emailVerified,
      });
      if (plan instanceof ElysiaCustomStatusResponse) return plan;
      return savePlan(ctx, plan, Sync.completeCollection);
    },
    {
      body: z.array(collectionSyncSchema.omit({ collectionId: true })).min(1),
      auth: true,
      rateLimit: "collection",
    },
  )
  .get("/sessions", (ctx) => serve(ctx, Sync.sessions, { query: ctx.query }), {
    query: z.object({
      page: z.string().optional(),
      limit: z.string().optional(),
      status: z
        .union([z.enum(SYNC_SESSION_STATUSES), z.array(z.enum(SYNC_SESSION_STATUSES))])
        .transform((v) => (Array.isArray(v) ? v : [v]))
        .optional(),
      syncType: z
        .union([z.enum(SYNC_TYPES), z.array(z.enum(SYNC_TYPES))])
        .transform((v) => (Array.isArray(v) ? v : [v]))
        .optional(),
    }),
    auth: true,
  })
  .get(
    "/sessions/:id",
    (ctx) => serve(ctx, Sync.sessionDetail, { query: ctx.query, params: ctx.params }),
    {
      params: z.object({ id: z.string() }),
      query: z.object({
        page: z.string().optional(),
        limit: z.string().optional(),
        status: z
          .union([z.enum(SYNC_SESSION_ITEM_STATUSES), z.array(z.enum(SYNC_SESSION_ITEM_STATUSES))])
          .transform((value) => (Array.isArray(value) ? value : [value]))
          .optional(),
      }),
      auth: true,
    },
  )
  .post(
    "/sessions/:id/retry",
    (ctx) =>
      serve(ctx, SyncRuns.retry, {
        id: ctx.params.id,
        emailVerified: ctx.user.emailVerified,
      }),
    {
      params: z.object({ id: z.string() }),
      auth: true,
      rateLimit: "retry",
    },
  )
  .post(
    "/sessions/:id/items",
    async (ctx) => {
      const existing = await serve(ctx, SyncRuns.itemStatus, {
        id: ctx.params.id,
        mfcItemId: ctx.body.mfcItemId,
        emailVerified: ctx.user.emailVerified,
      });
      if (existing !== null) return existing;
      return serve(ctx, SyncRuns.complete, { id: ctx.params.id, upload: ctx.body });
    },
    { params: sessionParams, body: syncItemUploadSchema, auth: true, rateLimit: "mfcIngest" },
  )
  .post(
    "/sessions/:id/failures",
    async (ctx) => {
      return serve(ctx, SyncRuns.failure, {
        id: ctx.params.id,
        failure: ctx.body,
        emailVerified: ctx.user.emailVerified,
      });
    },
    { params: sessionParams, body: syncItemFailureSchema, auth: true, rateLimit: "syncFailure" },
  )
  .post(
    "/sessions/:id/heartbeat",
    async (ctx) => {
      return serve(ctx, SyncRuns.heartbeat, {
        id: ctx.params.id,
        jobId: ctx.body.jobId,
      });
    },
    { params: sessionParams, body: syncRunSchema, auth: true, rateLimit: "syncControl" },
  )
  .post(
    "/sessions/:id/interrupt",
    async (ctx) => {
      return serve(ctx, SyncRuns.interrupt, {
        id: ctx.params.id,
        jobId: ctx.body.jobId,
      });
    },
    { params: sessionParams, body: syncRunSchema, auth: true, rateLimit: "syncControl" },
  )
  .get(
    "/job-status",
    async function* (ctx) {
      const { query, log, request } = ctx;
      log.set({
        sync: { jobId: query.jobId },
      });

      const { jobId } = query;
      const streamStartedAt = Date.now();
      const streamStartedAtIso = new Date(streamStartedAt).toISOString();
      const abortPromise = request.signal.aborted
        ? Promise.resolve<"aborted">("aborted")
        : new Promise<"aborted">((resolve) => {
            request.signal.addEventListener("abort", () => resolve("aborted"), { once: true });
          });

      const logTerminalOutcome = (terminalState: SyncTerminalState): void => {
        log.set({
          outcome: terminalState,
          result: { terminalState },
        });
      };

      const initialJobStatus = await serve(ctx, Sync.jobStatus, { jobId });

      if (initialJobStatus instanceof ElysiaCustomStatusResponse) {
        const isNotFound = initialJobStatus.code === 404;
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
        const replayJobStatus = await serve(ctx, Sync.jobStatus, { jobId });

        if (replayJobStatus instanceof ElysiaCustomStatusResponse) {
          const isNotFound = replayJobStatus.code === 404;
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
            const polledStatus = await serve(ctx, Sync.jobStatus, { jobId });
            if (polledStatus instanceof ElysiaCustomStatusResponse) {
              const isNotFound = polledStatus.code === 404;
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
            if (!request.signal.aborted) {
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
    },
    {
      query: z.object({ jobId: z.string().min(1) }),
      auth: true,
    },
  );

export default syncRouter;
