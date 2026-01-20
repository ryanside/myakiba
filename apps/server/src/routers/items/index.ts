import { Elysia, status } from "elysia";
import ItemService from "./service";
import { tryCatch } from "@myakiba/utils";
import { betterAuth } from "@/middleware/better-auth";
import { itemParamSchema } from "./model";

const itemsRouter = new Elysia({ prefix: "/items" })
  .use(betterAuth)
  .get(
    "/:itemId",
    async ({ params }) => {
      const { data: item, error } = await tryCatch(
        ItemService.getItem(params.itemId)
      );
      if (error) {
        console.error("Error fetching item:", error, {
          itemId: params.itemId,
        });
        return status(500, "Failed to get item");
      }
      return { item };
    },
    { params: itemParamSchema }
  )
  .get(
    "/:itemId/orders",
    async ({ params, user }) => {
      if (!user) return status(401, "Unauthorized");

      const { data: orders, error } = await tryCatch(
        ItemService.getItemRelatedOrders(user.id, params.itemId)
      );
      if (error) {
        return status(500, "Failed to get item related orders");
      }
      return { orders };
    },
    { params: itemParamSchema, auth: true }
  )
  .get(
    "/:itemId/collection",
    async ({ params, user }) => {
      if (!user) return status(401, "Unauthorized");

      const { data: collection, error } = await tryCatch(
        ItemService.getItemRelatedCollection(user.id, params.itemId)
      );
      if (error) {
        return status(500, "Failed to get item related collections");
      }
      return { collection };
    },
    { params: itemParamSchema, auth: true }
  )
  .get(
    "/:itemId/releases",
    async ({ params }) => {
      const { data: releases, error } = await tryCatch(
        ItemService.getItemReleases(params.itemId)
      );

      if (error) {
        if (error.message === "FAILED_TO_GET_ITEM_RELEASES") {
          return status(500, "Failed to get item releases");
        }

        console.error("Error fetching item releases:", error, {
          itemId: params.itemId,
        });
        return status(500, "Failed to get item releases");
      }

      return releases;
    },
    { params: itemParamSchema }
  );

export default itemsRouter;
