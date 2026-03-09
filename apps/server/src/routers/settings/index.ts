import { Elysia, status } from "elysia";
import SettingsService from "./service";
import { tryCatch } from "@myakiba/utils";
import { z } from "zod";
import { betterAuth } from "@/middleware/better-auth";
import { evlog } from "evlog/elysia";

const settingsRouter = new Elysia({ prefix: "/settings" })
  .use(betterAuth)
  .use(evlog())
  .get(
    "/account-type",
    async ({ user, log }) => {
      if (!user) return status(401, "Unauthorized");

      log.set({ action: "settings.getAccountType", user: { id: user.id } });

      const { data: hasCredential, error } = await tryCatch(
        SettingsService.hasCredentialAccount(user.id),
      );

      if (error) {
        log.error(error, { step: "hasCredentialAccount", outcome: "error" });
        return status(500, "Failed to check account type");
      }

      log.set({ outcome: "success" });
      return { hasCredentialAccount: hasCredential };
    },
    { auth: true },
  )
  .delete(
    "/account",
    async ({ body, user, log }) => {
      if (!user) return status(401, "Unauthorized");

      log.set({ action: "settings.deleteAccount", user: { id: user.id } });

      if (body.confirmationPhrase !== "delete my account") {
        log.set({ outcome: "bad_request" });
        return status(400, "Invalid confirmation phrase");
      }

      const { data: hasCredential, error: checkError } = await tryCatch(
        SettingsService.hasCredentialAccount(user.id),
      );

      if (checkError) {
        log.error(checkError, { step: "hasCredentialAccount", outcome: "error" });
        return status(500, "Failed to check account type");
      }

      if (hasCredential) {
        log.set({ outcome: "bad_request" });
        return status(400, "This endpoint is only for OAuth users. Please use password deletion.");
      }

      const { error: deleteError } = await tryCatch(SettingsService.deleteUser(user.id));

      if (deleteError) {
        log.error(deleteError, { step: "deleteUser", outcome: "error" });
        return status(500, "Failed to delete account");
      }

      log.set({ outcome: "success" });
      return "Account deleted successfully";
    },
    {
      body: z.object({ confirmationPhrase: z.string() }),
      auth: true,
    },
  );

export default settingsRouter;
