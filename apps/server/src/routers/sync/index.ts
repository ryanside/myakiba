import { privateApi } from "@/boundary/private-api";
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
import { serve } from "@/domain/kernel";
import { Sync, SyncRequests, SyncRuns } from "./module";
import {
  SYNC_SESSION_ITEM_STATUSES,
  SYNC_SESSION_STATUSES,
  SYNC_TYPES,
} from "@myakiba/contracts/shared/constants";

const sessionParams = z.object({ id: z.string() });

const syncRouter = privateApi("/sync")
  .use(rateLimit)
  .post(
    "/item",
    (ctx) =>
      serve(ctx, SyncRequests.item, { body: ctx.body, emailVerified: ctx.user.emailVerified }),
    { body: itemSyncSchema, auth: true, rateLimit: "item" },
  )
  .post(
    "/csv",
    (ctx) =>
      serve(ctx, SyncRequests.csv, { body: ctx.body, emailVerified: ctx.user.emailVerified }),
    {
      body: z.array(internalCsvItemSchema.omit({ collectionId: true })).min(1),
      auth: true,
      rateLimit: "csv",
    },
  )
  .post(
    "/order",
    (ctx) =>
      serve(ctx, SyncRequests.order, { body: ctx.body, emailVerified: ctx.user.emailVerified }),
    {
      body: orderSyncSchema,
      auth: true,
      rateLimit: "order",
    },
  )
  .post(
    "/order-item",
    (ctx) =>
      serve(ctx, SyncRequests.orderItem, { body: ctx.body, emailVerified: ctx.user.emailVerified }),
    {
      body: syncOrderItemsSchema,
      auth: true,
      rateLimit: "order",
    },
  )
  .post(
    "/collection",
    (ctx) =>
      serve(ctx, SyncRequests.collection, {
        body: ctx.body,
        emailVerified: ctx.user.emailVerified,
      }),
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
    (ctx) => {
      ctx.log.set({ sync: { sessionId: ctx.params.id } });
      return serve(ctx, SyncRuns.retry, {
        id: ctx.params.id,
        emailVerified: ctx.user.emailVerified,
      });
    },
    {
      params: z.object({ id: z.string() }),
      auth: true,
      rateLimit: "retry",
    },
  )
  .post(
    "/sessions/:id/items",
    async (ctx) => {
      ctx.log.set({
        sync: { sessionId: ctx.params.id, jobId: ctx.body.jobId },
        mfc: { itemId: ctx.body.mfcItemId },
      });
      return serve(ctx, SyncRequests.complete, {
        id: ctx.params.id,
        upload: ctx.body,
        emailVerified: ctx.user.emailVerified,
      });
    },
    { params: sessionParams, body: syncItemUploadSchema, auth: true, rateLimit: "mfcIngest" },
  )
  .post(
    "/sessions/:id/failures",
    async (ctx) => {
      const { body } = ctx;
      ctx.log.set({
        sync: { sessionId: ctx.params.id, jobId: body.jobId },
        mfc:
          "failures" in body
            ? { failureCount: body.failures.length }
            : { itemId: body.mfcItemId, error: body.error },
      });
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
      ctx.log.set({ sync: { sessionId: ctx.params.id, jobId: ctx.body.jobId } });
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
      ctx.log.set({ sync: { sessionId: ctx.params.id, jobId: ctx.body.jobId } });
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
      return yield* serve(ctx, SyncRequests.stream, {
        jobId: ctx.query.jobId,
        signal: ctx.request.signal,
      });
    },
    {
      query: z.object({ jobId: z.string().min(1) }),
      auth: true,
    },
  );

export default syncRouter;
