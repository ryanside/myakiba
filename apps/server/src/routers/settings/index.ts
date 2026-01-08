import { Hono } from "hono";
import type { Variables } from "../..";
import SettingsService from "./service";
import { tryCatch } from "@myakiba/utils";
import { zValidator } from "@hono/zod-validator";
import { budgetUpsertSchema } from "./model";

const settingsRouter = new Hono<{
  Variables: Variables;
}>()
  .get("/", async (c) => {
    const user = c.get("user");
    if (!user) return c.text("Unauthorized", 401);

    const { data: budget, error } = await tryCatch(
      SettingsService.getBudget(user.id)
    );

    if (error) {
      console.error("Error fetching budget:", error, {
        userId: user.id,
      });

      return c.text("Failed to get budget", 500);
    }

    return c.json({ budget });
  })
  .put(
    "/",
    zValidator("json", budgetUpsertSchema, (result, c) => {
      if (!result.success) {
        console.log(result.error);
        return c.text("Invalid request!", 400);
      }
    }),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.text("Unauthorized", 401);

      const validatedBody = c.req.valid("json");

      const { data: budget, error } = await tryCatch(
        SettingsService.upsertBudget(user.id, validatedBody)
      );

      if (error) {
        console.error("Error upserting budget:", error, {
          userId: user.id,
        });

        return c.text("Failed to upsert budget", 500);
      }

      return c.json({ budget });
    }
  )

  .delete("/", async (c) => {
    const user = c.get("user");
    if (!user) return c.text("Unauthorized", 401);

    const { error } = await tryCatch(SettingsService.deleteBudget(user.id));

    if (error) {
      console.error("Error deleting budget:", error, {
        userId: user.id,
      });

      return c.text("Failed to delete budget", 500);
    }

    return c.text("Budget deleted successfully");
  });
export default settingsRouter;
