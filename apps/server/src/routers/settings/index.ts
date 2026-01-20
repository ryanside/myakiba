import { Elysia, status } from "elysia";
import SettingsService from "./service";
import { tryCatch } from "@myakiba/utils";
import { budgetUpsertSchema } from "./model";
import { z } from "zod";
import { betterAuth } from "@/middleware/better-auth";

const settingsRouter = new Elysia({ prefix: "/settings" })
  .use(betterAuth)
  .get(
    "/",
    async ({ user }) => {
      if (!user) return status(401, "Unauthorized");

      const { data: budget, error } = await tryCatch(
        SettingsService.getBudget(user.id)
      );

      if (error) {
        console.error("Error fetching budget:", error, {
          userId: user.id,
        });

        return status(500, "Failed to get budget");
      }

      return { budget };
    },
    { auth: true }
  )
  .put(
    "/",
    async ({ body, user }) => {
      if (!user) return status(401, "Unauthorized");

      const { data: budget, error } = await tryCatch(
        SettingsService.upsertBudget(user.id, body)
      );

      if (error) {
        console.error("Error upserting budget:", error, {
          userId: user.id,
        });

        return status(500, "Failed to upsert budget");
      }

      return { budget };
    },
    { body: budgetUpsertSchema, auth: true }
  )
  .delete(
    "/",
    async ({ user }) => {
      if (!user) return status(401, "Unauthorized");

      const { error } = await tryCatch(SettingsService.deleteBudget(user.id));

      if (error) {
        console.error("Error deleting budget:", error, {
          userId: user.id,
        });

        return status(500, "Failed to delete budget");
      }

      return "Budget deleted successfully";
    },
    { auth: true }
  )
  .get(
    "/account-type",
    async ({ user }) => {
      if (!user) return status(401, "Unauthorized");

      const { data: hasCredential, error } = await tryCatch(
        SettingsService.hasCredentialAccount(user.id)
      );

      if (error) {
        console.error("Error checking account type:", error, {
          userId: user.id,
        });

        return status(500, "Failed to check account type");
      }

      return { hasCredentialAccount: hasCredential };
    },
    { auth: true }
  )
  .delete(
    "/account",
    async ({ body, user }) => {
      if (!user) return status(401, "Unauthorized");

      if (body.confirmationPhrase !== "delete my account") {
        return status(400, "Invalid confirmation phrase");
      }

      const { data: hasCredential, error: checkError } = await tryCatch(
        SettingsService.hasCredentialAccount(user.id)
      );

      if (checkError) {
        console.error("Error checking account type:", checkError, {
          userId: user.id,
        });
        return status(500, "Failed to check account type");
      }

      if (hasCredential) {
        return status(
          400,
          "This endpoint is only for OAuth users. Please use password deletion."
        );
      }

      const { error: deleteError } = await tryCatch(
        SettingsService.deleteUser(user.id)
      );

      if (deleteError) {
        console.error("Error deleting account:", deleteError, {
          userId: user.id,
        });
        return status(500, "Failed to delete account");
      }

      return "Account deleted successfully";
    },
    {
      body: z.object({ confirmationPhrase: z.string() }),
      auth: true,
    }
  );

export default settingsRouter;
