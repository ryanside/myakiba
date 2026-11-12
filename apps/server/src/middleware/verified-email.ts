import { Elysia } from "elysia";
import { EMAIL_VERIFICATION_REQUIRED } from "@myakiba/contracts/shared/messages";
import { betterAuth } from "./better-auth";

export const verifiedEmail = new Elysia({ name: "verified-email" })
  .use(betterAuth)
  .macro("verifiedEmail", {
    auth: true,
    beforeHandle({ user, status }) {
      if (!user.emailVerified) return status(403, EMAIL_VERIFICATION_REQUIRED);
    },
  });
