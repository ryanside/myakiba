import { Elysia, status } from "elysia";
import ItemService from "./service";
import ItemResyncService from "./resync-service";
import { tryCatch } from "@myakiba/utils/result";
import { betterAuth } from "@/middleware/better-auth";
import { evlog } from "evlog/elysia";
import { itemParamSchema, customItemSchema } from "./model";

const itemsRouter = new Elysia({ prefix: "/items" })
  .use(betterAuth)
  .use(evlog())
  .post(
    "/custom",
    async ({ body, user, log }) => {
      if (!user) return status(401, "Unauthorized");

      log.set({ action: "items.createCustom", user: { id: user.id } });

      const { data: customItem, error } = await tryCatch(ItemService.createCustomItem(body));

      if (error) {
        if (error.message === "ENTRY_NOT_FOUND") {
          log.set({ outcome: "not_found" });
          return status(404, "Entry not found");
        }
        if (error.message === "ENTRY_CATEGORY_MISMATCH") {
          log.set({ outcome: "bad_request" });
          return status(400, "Entry category mismatch");
        }
        if (error.message === "FAILED_TO_CREATE_CUSTOM_ITEM") {
          log.error(error, { step: "createCustomItem", outcome: "error" });
          return status(500, "Failed to create custom item");
        }

        log.error(error, { step: "createCustomItem", outcome: "error" });
        return status(500, "Failed to create custom item");
      }

      log.set({ outcome: "success" });
      return customItem;
    },
    { body: customItemSchema, auth: true },
  )
  .get(
    "/:itemId",
    async ({ params, log }) => {
      log.set({ action: "items.get", item: { id: params.itemId } });

      const { data: item, error } = await tryCatch(ItemService.getItem(params.itemId));

      if (error) {
        log.error(error, { step: "getItem", outcome: "error" });
        return status(500, "Failed to get item");
      }

      log.set({ outcome: "success" });
      return { item };
    },
    { params: itemParamSchema },
  )
  .get(
    "/:itemId/orders",
    async ({ params, user, log }) => {
      if (!user) return status(401, "Unauthorized");

      log.set({
        action: "items.getRelatedOrders",
        user: { id: user.id },
        item: { id: params.itemId },
      });

      const { data: orders, error } = await tryCatch(
        ItemService.getItemRelatedOrders(user.id, params.itemId),
      );

      if (error) {
        log.error(error, { step: "getItemRelatedOrders", outcome: "error" });
        return status(500, "Failed to get item related orders");
      }

      log.set({ outcome: "success" });
      return { orders };
    },
    { params: itemParamSchema, auth: true },
  )
  .get(
    "/:itemId/collection",
    async ({ params, user, log }) => {
      if (!user) return status(401, "Unauthorized");

      log.set({
        action: "items.getRelatedCollection",
        user: { id: user.id },
        item: { id: params.itemId },
      });

      const { data: collection, error } = await tryCatch(
        ItemService.getItemRelatedCollection(user.id, params.itemId),
      );

      if (error) {
        log.error(error, { step: "getItemRelatedCollection", outcome: "error" });
        return status(500, "Failed to get item related collections");
      }

      log.set({ outcome: "success" });
      return { collection };
    },
    { params: itemParamSchema, auth: true },
  )
  .get(
    "/:itemId/resync-status",
    async ({ params, log }) => {
      log.set({ action: "items.resyncStatus", item: { id: params.itemId } });

      const { data: resyncItem, error: validateError } = await tryCatch(
        ItemResyncService.validateItemForResync(params.itemId),
      );

      if (validateError) {
        if (validateError.message === "ITEM_NOT_FOUND") {
          log.set({ outcome: "not_found" });
          return status(404, "Item not found");
        }
        if (validateError.message === "ITEM_NOT_RESYNCABLE") {
          log.set({ outcome: "not_resyncable" });
          return { status: "idle" as const, cooldownExpiresAt: null };
        }
        log.error(validateError, { step: "validateItemForResync", outcome: "error" });
        return status(500, "Failed to check resync status");
      }

      const { data: state, error } = await tryCatch(
        ItemResyncService.getResyncStatus(resyncItem.id),
      );

      if (error) {
        log.error(error, { step: "getResyncStatus", outcome: "error" });
        return status(500, "Failed to check resync status");
      }

      log.set({ outcome: "success", resyncStatus: state.status });
      return state;
    },
    { params: itemParamSchema },
  )
  .post(
    "/:itemId/resync",
    async ({ params, user, log }) => {
      if (!user) return status(401, "Unauthorized");

      log.set({
        action: "items.requestResync",
        user: { id: user.id },
        item: { id: params.itemId },
      });

      const { data: resyncItem, error: validateError } = await tryCatch(
        ItemResyncService.validateItemForResync(params.itemId),
      );

      if (validateError) {
        if (validateError.message === "ITEM_NOT_FOUND") {
          log.set({ outcome: "not_found" });
          return status(404, "Item not found");
        }
        if (validateError.message === "ITEM_NOT_RESYNCABLE") {
          log.set({ outcome: "not_resyncable" });
          return status(400, "Item cannot be resynced");
        }
        log.error(validateError, { step: "validateItemForResync", outcome: "error" });
        return status(500, "Failed to request resync");
      }

      const { data: state, error } = await tryCatch(
        ItemResyncService.requestResync(resyncItem.id, resyncItem.externalId),
      );

      if (error) {
        if (error.message === "RESYNC_BLOCKED_REQUESTED") {
          log.set({ outcome: "blocked", reason: "already_requested" });
          return status(409, "Resync already requested");
        }
        if (error.message === "RESYNC_BLOCKED_PROCESSING") {
          log.set({ outcome: "blocked", reason: "processing" });
          return status(409, "Resync already in progress");
        }
        if (error.message === "RESYNC_BLOCKED_COOLDOWN") {
          log.set({ outcome: "blocked", reason: "cooldown" });
          return status(429, "Item was recently updated");
        }
        log.error(error, { step: "requestResync", outcome: "error" });
        return status(500, "Failed to request resync");
      }

      log.set({ outcome: "success" });
      return state;
    },
    { params: itemParamSchema, auth: true },
  );

export default itemsRouter;
