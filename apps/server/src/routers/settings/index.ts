import { Hono } from "hono";
import type { Variables } from "../..";
import SettingsService from "./service";
import { tryCatch } from "@myakiba/utils";
import { zValidator } from "@hono/zod-validator";
import { budgetUpsertSchema } from "./model";
import { z } from "zod";

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
  })
  .get("/account-type", async (c) => {
    const user = c.get("user");
    if (!user) return c.text("Unauthorized", 401);

    const { data: hasCredential, error } = await tryCatch(
      SettingsService.hasCredentialAccount(user.id)
    );

    if (error) {
      console.error("Error checking account type:", error, {
        userId: user.id,
      });

      return c.text("Failed to check account type", 500);
    }

    return c.json({ hasCredentialAccount: hasCredential });
  })
  .delete(
    "/account",
    zValidator(
      "json",
      z.object({
        confirmationPhrase: z.string(),
      }),
      (result, c) => {
        if (!result.success) {
          return c.text("Invalid request!", 400);
        }
      }
    ),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.text("Unauthorized", 401);

      const validatedBody = c.req.valid("json");

      // Verify confirmation phrase
      if (validatedBody.confirmationPhrase !== "delete my account") {
        return c.text("Invalid confirmation phrase", 400);
      }

      // Check if user has credential account (should not use this endpoint)
      const { data: hasCredential, error: checkError } = await tryCatch(
        SettingsService.hasCredentialAccount(user.id)
      );

      if (checkError) {
        console.error("Error checking account type:", checkError, {
          userId: user.id,
        });
        return c.text("Failed to check account type", 500);
      }

      if (hasCredential) {
        return c.text(
          "This endpoint is only for OAuth users. Please use password deletion.",
          400
        );
      }

      // Delete user account (cascade deletes will handle accounts and sessions)
      const { error: deleteError } = await tryCatch(
        SettingsService.deleteUser(user.id)
      );

      if (deleteError) {
        console.error("Error deleting account:", deleteError, {
          userId: user.id,
        });
        return c.text("Failed to delete account", 500);
      }

      return c.text("Account deleted successfully");
    }
  );
export default settingsRouter;
