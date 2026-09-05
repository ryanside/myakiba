import { Elysia, status } from "elysia";
import { evlog } from "evlog/elysia";
import { betterAuth } from "@/middleware/better-auth";
import { tryCatch } from "@myakiba/utils/result";
import { positionOrderInputSchema } from "@myakiba/contracts/shared/position-order";
import WishlistService from "./service";
import { wishlistItemIdParamSchema, wishlistPageQuerySchema } from "./model";

const wishlistRouter = new Elysia({ prefix: "/wishlist" })
  .use(betterAuth)
  .use(evlog())
  .get(
    "/",
    async ({ query, user, log }) => {
      log.set({ action: "wishlist.list", user: { id: user.id } });
      const { data: result, error } = await tryCatch(
        WishlistService.getEntries(user.id, query.limit, query.offset),
      );

      if (error) {
        log.error(error, { step: "getEntries", outcome: "error" });
        return status(500, "Failed to load Wishlist");
      }

      log.set({
        result: { count: result.items.length, totalCount: result.totalCount },
        outcome: "success",
      });
      return {
        ...result,
        items: result.items.map((entry) => ({
          ...entry,
          createdAt: entry.createdAt.toISOString(),
        })),
      };
    },
    { query: wishlistPageQuerySchema, auth: true },
  )
  .patch(
    "/order",
    async ({ body, user, log }) => {
      log.set({
        action: "wishlist.order.move",
        user: { id: user.id },
        entryCount: body.movedIds.length,
      });
      const { data: result, error } = await tryCatch(WishlistService.moveEntries(user.id, body));

      if (error) {
        log.error(error, { step: "moveEntries", outcome: "error" });
        return status(500, "Failed to save Wishlist order");
      }

      if (result.kind === "not_found") {
        log.set({ outcome: "not_found" });
        return status(404, "Wishlist Entry not found");
      }

      log.set({ outcome: "success" });
      return { moved: result.moved };
    },
    { body: positionOrderInputSchema, auth: true },
  )
  .put(
    "/:itemId",
    async ({ params, user, log }) => {
      log.set({
        action: "wishlist.entries.add",
        user: { id: user.id },
        item: { id: params.itemId },
      });
      const { data: result, error } = await tryCatch(
        WishlistService.addEntry(user.id, params.itemId),
      );

      if (error) {
        log.error(error, { step: "addEntry", outcome: "error" });
        return status(500, "Failed to add to Wishlist");
      }

      if (result.kind === "not_found") {
        log.set({ outcome: "not_found" });
        return status(404, "Item not found");
      }

      log.set({ addedCount: result.addedCount, outcome: "success" });
      return { addedCount: result.addedCount };
    },
    { params: wishlistItemIdParamSchema, auth: true },
  )
  .delete(
    "/:itemId",
    async ({ params, user, log }) => {
      log.set({
        action: "wishlist.entries.remove",
        user: { id: user.id },
        item: { id: params.itemId },
      });
      const { data: result, error } = await tryCatch(
        WishlistService.removeEntry(user.id, params.itemId),
      );

      if (error) {
        log.error(error, { step: "removeEntry", outcome: "error" });
        return status(500, "Failed to remove from Wishlist");
      }

      log.set({ removedCount: result.removedCount, outcome: "success" });
      return result;
    },
    { params: wishlistItemIdParamSchema, auth: true },
  );

export default wishlistRouter;
