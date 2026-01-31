import { Elysia, status } from "elysia";
import { timingSafeEqual } from "crypto";
import { env } from "@myakiba/env/server";
import { tryCatch } from "@myakiba/utils";
import WaitlistService from "./service";
import { joinWaitlistSchema, verifyAccessSchema } from "./model";
import { rateLimit } from "@/middleware/rate-limit";

async function verifyTurnstile(token: string): Promise<boolean> {
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      secret: env.TURNSTILE_SECRET_KEY,
      response: token,
    }),
  });

  const data = (await response.json()) as { success: boolean };
  return data.success;
}

const waitlistRouter = new Elysia({ prefix: "/waitlist" })
  .use(rateLimit)
  .post(
    "/",
    async ({ body }) => {
      const { email, turnstileToken } = body;

      const { data: isValidCaptcha, error: captchaError } = await tryCatch(
        verifyTurnstile(turnstileToken),
      );

      if (captchaError || !isValidCaptcha) {
        console.error("Turnstile verification failed:", captchaError, {
          email,
          turnstileToken,
        });
        return status(400, "Captcha verification failed");
      }

      const { error } = await tryCatch(WaitlistService.addToWaitlist(email));

      if (error) {
        console.error("Error adding to waitlist:", error);
        return status(500, "Failed to join waitlist");
      }

      return {
        success: true,
        message: "Successfully joined the waitlist!",
      };
    },
    {
      body: joinWaitlistSchema,
      rateLimit: "waitlist",
    },
  )
  .post(
    "/verify-access",
    async ({ body }) => {
      const { password } = body;

      const expectedPassword = env.EARLY_ACCESS_PASSWORD;
      const passwordBuffer = Buffer.from(password);
      const expectedBuffer = Buffer.from(expectedPassword);

      let isValid = false;
      if (passwordBuffer.length === expectedBuffer.length) {
        isValid = timingSafeEqual(passwordBuffer, expectedBuffer);
      }

      if (!isValid) {
        return status(401, "Invalid password");
      }

      return { success: true };
    },
    {
      body: verifyAccessSchema,
      rateLimit: "verifyAccess",
    },
  );

export default waitlistRouter;
