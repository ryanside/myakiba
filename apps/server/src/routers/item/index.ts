import { Elysia, status } from "elysia";
import ItemService from "./service";
import ItemResyncService from "./resync-service";
import { tryCatch } from "@myakiba/utils/result";
import { betterAuth } from "@/middleware/better-auth";
import { evlog } from "evlog/elysia";
import { itemParamSchema, customItemSchema } from "./model";

const itemRouter = new Elysia({ prefix: "/item" })
  .use(betterAuth)
  .use(evlog())
  .post(
    "/custom",
    async ({ body, user, log }) => {
      log.set({ action: "item.createCustom", user: { id: user.id } });

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
    "/:externalId",
    async ({ params, log }) => {
      log.set({ action: "item.get", item: { externalId: params.externalId } });

      const { data: item, error } = await tryCatch(ItemService.getItem(params.externalId));

      if (error) {
        if (error.message === "ITEM_NOT_FOUND") {
          log.set({ outcome: "not_found" });
          return status(404, "Item not found");
        }
        log.error(error, { step: "getItem", outcome: "error" });
        return status(500, "Failed to get item");
      }

      log.set({ outcome: "success" });
      return { item };
    },
    { params: itemParamSchema, auth: true },
  )
  .get(
    "/:externalId/orders",
    async ({ params, user, log }) => {
      log.set({
        action: "item.getRelatedOrders",
        user: { id: user.id },
        item: { externalId: params.externalId },
      });

      const { data: orders, error } = await tryCatch(
        ItemService.getItemRelatedOrders(user.id, params.externalId),
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
    "/:externalId/collection",
    async ({ params, user, log }) => {
      log.set({
        action: "item.getRelatedCollection",
        user: { id: user.id },
        item: { externalId: params.externalId },
      });

      const { data: collection, error } = await tryCatch(
        ItemService.getItemRelatedCollection(user.id, params.externalId),
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
    "/:externalId/resync-status",
    async ({ params, user, log }) => {
      log.set({
        action: "item.resyncStatus",
        user: { id: user.id },
        item: { externalId: params.externalId },
      });

      const { data: resyncItem, error: validateError } = await tryCatch(
        ItemResyncService.validateItemForResync(params.externalId),
      );

      if (validateError) {
        if (validateError.message === "ITEM_NOT_FOUND") {
          log.set({ outcome: "not_found" });
          return status(404, "Item not found");
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
    { params: itemParamSchema, auth: true },
  )
  .post(
    "/:externalId/resync",
    async ({ params, user, log }) => {
      log.set({
        action: "item.requestResync",
        user: { id: user.id },
        item: { externalId: params.externalId },
      });

      const { data: resyncItem, error: validateError } = await tryCatch(
        ItemResyncService.validateItemForResync(params.externalId),
      );

      if (validateError) {
        if (validateError.message === "ITEM_NOT_FOUND") {
          log.set({ outcome: "not_found" });
          return status(404, "Item not found");
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

export default itemRouter;
