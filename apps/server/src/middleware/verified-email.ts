import { Elysia } from "elysia";
import { SYNC_STATUS_MESSAGES } from "@myakiba/contracts/sync/messages";
import { betterAuth } from "./better-auth";

export const verifiedEmail = new Elysia({ name: "verified-email" })
  .use(betterAuth)
  .macro("verifiedEmail", {
    auth: true,
    beforeHandle({ user, status }) {
      if (!user.emailVerified) return status(403, SYNC_STATUS_MESSAGES.requireEmailVerification);
    },
  });
