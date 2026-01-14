import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { rateLimiter, type Store } from "hono-rate-limiter";
import RedisStore from "rate-limit-redis";
import Redis from "ioredis";
import { createHash, timingSafeEqual } from "crypto";
import type { Variables } from "../..";
import { env } from "@myakiba/env/server";
import { tryCatch } from "@myakiba/utils";
import WaitlistService from "./service";
import { joinWaitlistSchema, verifyAccessSchema } from "./model";

const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
});

// Verify Turnstile token
async function verifyTurnstile(token: string): Promise<boolean> {
  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET_KEY,
        response: token,
      }),
    }
  );

  const data = (await response.json()) as { success: boolean };
  return data.success;
}

function getClientIdentifier(c: {
  req: { header: (name: string) => string | undefined };
}): string {
  const ip =
    c.req.header("cf-connecting-ip") ||
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  const userAgent = c.req.header("user-agent");
  const acceptLanguage = c.req.header("accept-language");

  const fingerprint = `${ip}:${userAgent}:${acceptLanguage}`;

  // Hash for privacy - enables rate limiting without storing identifying info
  return createHash("sha256").update(fingerprint).digest("hex").slice(0, 16);
}

// Rate limiters
const waitlistRateLimit = rateLimiter<{ Variables: Variables }>({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 5,
  keyGenerator: getClientIdentifier,
  store: new RedisStore({
    sendCommand: (command: string, ...args: string[]) =>
      redis.call(command, ...args) as never,
    prefix: "waitlist_rate_limit:",
  }) as unknown as Store<{ Variables: Variables }>,
});

const verifyAccessRateLimit = rateLimiter<{ Variables: Variables }>({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5,
  keyGenerator: getClientIdentifier,
  store: new RedisStore({
    sendCommand: (command: string, ...args: string[]) =>
      redis.call(command, ...args) as never,
    prefix: "verify_access_rate_limit:",
  }) as unknown as Store<{ Variables: Variables }>,
});

const waitlistRouter = new Hono<{ Variables: Variables }>()
  // Join waitlist
  .post(
    "/",
    waitlistRateLimit,
    zValidator("json", joinWaitlistSchema, (result, c) => {
      if (!result.success) {
        return c.json({ error: "Invalid request" }, 400);
      }
    }),
    async (c) => {
      const { email, turnstileToken } = c.req.valid("json");

      // Verify Turnstile
      const { data: isValidCaptcha, error: captchaError } = await tryCatch(
        verifyTurnstile(turnstileToken)
      );

      if (captchaError || !isValidCaptcha) {
        console.error("Turnstile verification failed:", captchaError, {
          email,
          turnstileToken,
        });
        return c.text("Captcha verification failed", 400);
      }

      // Add to waitlist
      const { error } = await tryCatch(WaitlistService.addToWaitlist(email));

      if (error) {
        console.error("Error adding to waitlist:", error);
        return c.text("Failed to join waitlist", 500);
      }

      return c.json({
        success: true,
        message: "Successfully joined the waitlist!",
      });
    }
  )
  // Verify early access password
  .post(
    "/verify-access",
    verifyAccessRateLimit,
    zValidator("json", verifyAccessSchema, (result, c) => {
      if (!result.success) {
        return c.json({ error: "Invalid request" }, 400);
      }
    }),
    async (c) => {
      const { password } = c.req.valid("json");

      // Constant-time comparison
      const expectedPassword = env.EARLY_ACCESS_PASSWORD;
      const passwordBuffer = Buffer.from(password);
      const expectedBuffer = Buffer.from(expectedPassword);

      let isValid = false;
      if (passwordBuffer.length === expectedBuffer.length) {
        isValid = timingSafeEqual(passwordBuffer, expectedBuffer);
      }

      if (!isValid) {
        return c.text("Invalid password", 401);
      }

      return c.json({ success: true });
    }
  );

export default waitlistRouter;
