import { Hono } from "hono";
import type { Variables } from "../..";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getItemReleases } from "./service";
import { tryCatch } from "@/lib/utils";

const itemsRouter = new Hono<{ Variables: Variables }>().get(
  "/:itemId/releases",
  zValidator(
    "param",
    z.object({
      itemId: z.coerce.number(),
    })
  ),
  async (c) => {
    const { itemId } = c.req.valid("param");

    const { data: releases, error } = await tryCatch(getItemReleases(itemId));

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
