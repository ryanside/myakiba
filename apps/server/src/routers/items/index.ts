import { Elysia, status } from "elysia";
import ItemService from "./service";
import { tryCatch } from "@myakiba/utils";
import { betterAuth } from "@/middleware/better-auth";
import { requestContext } from "@/middleware/request-context";
import { itemParamSchema, customItemSchema } from "./model";

const itemsRouter = new Elysia({ prefix: "/items" })
  .use(betterAuth)
  .use(requestContext)
  .post(
    "/custom",
    async ({ body, user, wideEvent }) => {
      if (!user) return status(401, "Unauthorized");

      wideEvent.set({ userId: user.id });

      const { data: customItem, error } = await tryCatch(ItemService.createCustomItem(body));

      if (error) {
        if (error.message === "ENTRY_NOT_FOUND") {
          wideEvent.set({ outcome: "not_found" });
          return status(404, "Entry not found");
        }
        if (error.message === "ENTRY_CATEGORY_MISMATCH") {
          wideEvent.set({ outcome: "bad_request" });
          return status(400, "Entry category mismatch");
        }
        if (error.message === "FAILED_TO_CREATE_CUSTOM_ITEM") {
          wideEvent.set({ error, outcome: "error" });
          return status(500, "Failed to create custom item");
        }

        wideEvent.set({ error, outcome: "error" });
        return status(500, "Failed to create custom item");
      }

      wideEvent.set({ outcome: "success" });
      return customItem;
    },
    { body: customItemSchema, auth: true },
  )
  .get(
    "/:itemId",
    async ({ params, wideEvent }) => {
      wideEvent.set({ itemId: params.itemId });

      const { data: item, error } = await tryCatch(ItemService.getItem(params.itemId));

      if (error) {
        wideEvent.set({ error, outcome: "error" });
        return status(500, "Failed to get item");
      }

      wideEvent.set({ outcome: "success" });
      return { item };
    },
    { params: itemParamSchema },
  )
  .get(
    "/:itemId/orders",
    async ({ params, user, wideEvent }) => {
      if (!user) return status(401, "Unauthorized");

      wideEvent.set({ userId: user.id, itemId: params.itemId });

      const { data: orders, error } = await tryCatch(
        ItemService.getItemRelatedOrders(user.id, params.itemId),
      );

      if (error) {
        wideEvent.set({ error, outcome: "error" });
        return status(500, "Failed to get item related orders");
      }

      wideEvent.set({ outcome: "success" });
      return { orders };
    },
    { params: itemParamSchema, auth: true },
  )
  .get(
    "/:itemId/collection",
    async ({ params, user, wideEvent }) => {
      if (!user) return status(401, "Unauthorized");

      wideEvent.set({ userId: user.id, itemId: params.itemId });

      const { data: collection, error } = await tryCatch(
        ItemService.getItemRelatedCollection(user.id, params.itemId),
      );

      if (error) {
        wideEvent.set({ error, outcome: "error" });
        return status(500, "Failed to get item related collections");
      }

      wideEvent.set({ outcome: "success" });
      return { collection };
    },
    { params: itemParamSchema, auth: true },
  )
  .get(
    "/:itemId/releases",
    async ({ params, wideEvent }) => {
      wideEvent.set({ itemId: params.itemId });

      const { data: releases, error } = await tryCatch(ItemService.getItemReleases(params.itemId));

      if (error) {
        if (error.message === "FAILED_TO_GET_ITEM_RELEASES") {
          wideEvent.set({ error, outcome: "error" });
          return status(500, "Failed to get item releases");
        }

        wideEvent.set({ error, outcome: "error" });
        return status(500, "Failed to get item releases");
      }

      wideEvent.set({ outcome: "success" });
      return releases;
    },
    { params: itemParamSchema },
  );

export default itemsRouter;
