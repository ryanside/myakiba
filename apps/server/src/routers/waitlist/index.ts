import { Elysia, status } from "elysia";
import { timingSafeEqual } from "crypto";
import { env } from "@myakiba/env/server";
import { tryCatch } from "@myakiba/utils";
import WaitlistService from "./service";
import { joinWaitlistSchema, verifyAccessSchema } from "./model";
import { rateLimit } from "@/middleware/rate-limit";
import { requestContext } from "@/middleware/request-context";

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
  .use(requestContext)
  .use(rateLimit)
  .post(
    "/",
    async ({ body, wideEvent }) => {
      const { email, turnstileToken } = body;

      wideEvent.set({ email });

      const { data: isValidCaptcha, error: captchaError } = await tryCatch(
        verifyTurnstile(turnstileToken),
      );

      if (captchaError || !isValidCaptcha) {
        wideEvent.set({ error: captchaError ?? null, outcome: "bad_request" });
        return status(400, "Captcha verification failed");
      }

      const { error } = await tryCatch(WaitlistService.addToWaitlist(email));

      if (error) {
        wideEvent.set({ error, outcome: "error" });
        return status(500, "Failed to join waitlist");
      }

      wideEvent.set({ outcome: "success" });
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
    async ({ body, wideEvent }) => {
      const { password } = body;

      const expectedPassword = env.EARLY_ACCESS_PASSWORD;
      const passwordBuffer = Buffer.from(password);
      const expectedBuffer = Buffer.from(expectedPassword);

      let isValid = false;
      if (passwordBuffer.length === expectedBuffer.length) {
        isValid = timingSafeEqual(passwordBuffer, expectedBuffer);
      }

      if (!isValid) {
        wideEvent.set({ outcome: "unauthorized" });
        return status(401, "Invalid password");
      }

      wideEvent.set({ outcome: "success" });
      return { success: true };
    },
    {
      body: verifyAccessSchema,
      rateLimit: "verifyAccess",
    },
  );

export default waitlistRouter;
