import { Elysia, status } from "elysia";
import SettingsService from "./service";
import { tryCatch } from "@myakiba/utils";
import { budgetUpsertSchema } from "./model";
import { z } from "zod";
import { betterAuth } from "@/middleware/better-auth";
import { requestContext } from "@/middleware/request-context";

const settingsRouter = new Elysia({ prefix: "/settings" })
  .use(betterAuth)
  .use(requestContext)
  .get(
    "/",
    async ({ user, wideEvent }) => {
      if (!user) return status(401, "Unauthorized");

      wideEvent.set({ userId: user.id });

      const { data: budget, error } = await tryCatch(SettingsService.getBudget(user.id));

      if (error) {
        wideEvent.set({ error, outcome: "error" });
        return status(500, "Failed to get budget");
      }

      wideEvent.set({ outcome: "success" });
      return { budget };
    },
    { auth: true },
  )
  .put(
    "/",
    async ({ body, user, wideEvent }) => {
      if (!user) return status(401, "Unauthorized");

      wideEvent.set({ userId: user.id });

      const { data: budget, error } = await tryCatch(SettingsService.upsertBudget(user.id, body));

      if (error) {
        wideEvent.set({ error, outcome: "error" });
        return status(500, "Failed to upsert budget");
      }

      wideEvent.set({ outcome: "success" });
      return { budget };
    },
    { body: budgetUpsertSchema, auth: true },
  )
  .delete(
    "/",
    async ({ user, wideEvent }) => {
      if (!user) return status(401, "Unauthorized");

      wideEvent.set({ userId: user.id });

      const { error } = await tryCatch(SettingsService.deleteBudget(user.id));

      if (error) {
        wideEvent.set({ error, outcome: "error" });
        return status(500, "Failed to delete budget");
      }

      wideEvent.set({ outcome: "success" });
      return "Budget deleted successfully";
    },
    { auth: true },
  )
  .get(
    "/account-type",
    async ({ user, wideEvent }) => {
      if (!user) return status(401, "Unauthorized");

      wideEvent.set({ userId: user.id });

      const { data: hasCredential, error } = await tryCatch(
        SettingsService.hasCredentialAccount(user.id),
      );

      if (error) {
        wideEvent.set({ error, outcome: "error" });
        return status(500, "Failed to check account type");
      }

      wideEvent.set({ outcome: "success" });
      return { hasCredentialAccount: hasCredential };
    },
    { auth: true },
  )
  .delete(
    "/account",
    async ({ body, user, wideEvent }) => {
      if (!user) return status(401, "Unauthorized");

      wideEvent.set({ userId: user.id });

      if (body.confirmationPhrase !== "delete my account") {
        wideEvent.set({ outcome: "bad_request" });
        return status(400, "Invalid confirmation phrase");
      }

      const { data: hasCredential, error: checkError } = await tryCatch(
        SettingsService.hasCredentialAccount(user.id),
      );

      if (checkError) {
        wideEvent.set({ error: checkError, outcome: "error" });
        return status(500, "Failed to check account type");
      }

      if (hasCredential) {
        wideEvent.set({ outcome: "bad_request" });
        return status(400, "This endpoint is only for OAuth users. Please use password deletion.");
      }

      const { error: deleteError } = await tryCatch(SettingsService.deleteUser(user.id));

      if (deleteError) {
        wideEvent.set({ error: deleteError, outcome: "error" });
        return status(500, "Failed to delete account");
      }

      wideEvent.set({ outcome: "success" });
      return "Account deleted successfully";
    },
    {
      body: z.object({ confirmationPhrase: z.string() }),
      auth: true,
    },
  );

export default settingsRouter;
