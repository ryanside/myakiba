import { Elysia, status } from "elysia";
import SettingsService from "./service";
import { tryCatch } from "@myakiba/utils/result";
import { betterAuth } from "@/middleware/better-auth";
import { evlog } from "evlog/elysia";

const settingsRouter = new Elysia({ prefix: "/settings" })
  .use(betterAuth)
  .use(evlog())
  .get(
    "/account-type",
    async ({ user, log }) => {
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
  );

export default settingsRouter;
