import { Hono } from "hono";
import type { Variables } from "../..";
import { zValidator } from "@hono/zod-validator";
import * as z from "zod";
import ItemService from "./service";
import { tryCatch } from "@/lib/utils";

const itemsRouter = new Hono<{ Variables: Variables }>()
  .get(
    "/:itemId",
    zValidator(
      "param",
      z.object({ itemId: z.coerce.number() }),
      (result, c) => {
        if (!result.success) {
          console.error(result.error);
          return c.text("Invalid request!", 400);
        }
      }
    ),
    async (c) => {
      const { itemId } = c.req.valid("param");
      const { data: item, error } = await tryCatch(ItemService.getItem(itemId));
      if (error) {
        return c.text("Failed to get item", 500);
      }
      return c.json({ item });
    }
  )

  .get(
    "/:itemId/releases",
    zValidator(
      "param",
      z.object({
        itemId: z.coerce.number(),
      }),
      (result, c) => {
        if (!result.success) {
          console.error(result.error);
          return c.text("Invalid request!", 400);
        }
      }
    ),
    async (c) => {
      const { itemId } = c.req.valid("param");

      const { data: releases, error } = await tryCatch(
        ItemService.getItemReleases(itemId)
      );

      if (error) {
        if (error.message === "FAILED_TO_GET_ITEM_RELEASES") {
          return c.text("Failed to get item releases", 500);
        }

        console.error("Error fetching item releases:", error, {
          itemId,
        });
        return c.text("Failed to get item releases", 500);
      }

      return c.json(releases);
    }
  );
export default itemsRouter;
