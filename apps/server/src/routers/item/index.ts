/* oxlint-disable no-restricted-imports -- only the item resync routes use these; Item Refresh is scraper code, left as it is until the browser extension replaces it (until 2027-01-31, approved by root: scraper resync routes stay untouched, pending operator review) */
import { status } from "elysia";
import { tryCatch } from "@myakiba/utils/result";
/* oxlint-enable no-restricted-imports */
import { privateApi } from "@/boundary/private-api";
import { serve } from "@/domain/kernel";
import ItemResyncService, { deriveResyncStatus } from "./resync-service";
import { itemIdParamSchema, itemParamSchema, customItemSchema } from "./model";
import { Items } from "./module";

const itemRouter = privateApi("/item")
  .post("/custom", (ctx) => serve(ctx, Items.createCustom, ctx.body), { body: customItemSchema })
  .get("/:id/releases", (ctx) => serve(ctx, Items.releases, ctx.params), {
    params: itemIdParamSchema,
  })
  .get("/:id", (ctx) => serve(ctx, Items.get, ctx.params), { params: itemParamSchema })
  .get("/:id/orders", (ctx) => serve(ctx, Items.relatedOrders, ctx.params), {
    params: itemParamSchema,
  })
  .get("/:id/collection", (ctx) => serve(ctx, Items.relatedCollection, ctx.params), {
    params: itemParamSchema,
  })
  .get(
    "/:id/resync-status",
    async ({ params, user, log }) => {
      log.set({
        action: "item.resyncStatus",
        user: { id: user.id },
        item: { externalId: params.id },
      });

      const { data: resyncItem, error: validateError } = await tryCatch(
        ItemResyncService.validateItemForResync(params.id),
      );

      if (validateError) {
        if (validateError.message === "ITEM_NOT_FOUND") {
          log.set({ outcome: "not_found" });
          return status(404, "Item not found");
        }
        log.error(validateError, { step: "validateItemForResync", outcome: "error" });
        return status(500, "Failed to check item refresh status");
      }

      const { data: state, error } = await tryCatch(deriveResyncStatus(resyncItem.id));

      if (error) {
        log.error(error, { step: "getResyncStatus", outcome: "error" });
        return status(500, "Failed to check item refresh status");
      }

      log.set({ outcome: "success", resyncStatus: state.status });
      return state;
    },
    { params: itemParamSchema, auth: true },
  )
  .post(
    "/:id/resync",
    async ({ params, user, log }) => {
      log.set({
        action: "item.requestResync",
        user: { id: user.id },
        item: { externalId: params.id },
      });

      const { data: resyncItem, error: validateError } = await tryCatch(
        ItemResyncService.validateItemForResync(params.id),
      );

      if (validateError) {
        if (validateError.message === "ITEM_NOT_FOUND") {
          log.set({ outcome: "not_found" });
          return status(404, "Item not found");
        }
        log.error(validateError, { step: "validateItemForResync", outcome: "error" });
        return status(500, "Failed to request item refresh");
      }

      const { data: state, error } = await tryCatch(
        ItemResyncService.requestResync(resyncItem.id, resyncItem.externalId),
      );

      if (error) {
        if (error.message === "RESYNC_BLOCKED_REQUESTED") {
          log.set({ outcome: "blocked", reason: "already_requested" });
          return status(409, "Item refresh already requested");
        }
        if (error.message === "RESYNC_BLOCKED_PROCESSING") {
          log.set({ outcome: "blocked", reason: "processing" });
          return status(409, "Item details are already being refreshed");
        }
        if (error.message === "RESYNC_BLOCKED_COOLDOWN") {
          log.set({ outcome: "blocked", reason: "cooldown" });
          return status(429, "Item details were recently refreshed");
        }
        log.error(error, { step: "requestResync", outcome: "error" });
        return status(500, "Failed to request item refresh");
      }

      log.set({ outcome: "success" });
      return state;
    },
    { params: itemParamSchema, auth: true },
  );

export default itemRouter;
