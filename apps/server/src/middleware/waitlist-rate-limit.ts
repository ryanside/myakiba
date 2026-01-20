import Redis from "ioredis";
import { createHash } from "crypto";
import { env } from "@myakiba/env/server";

const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
});

interface RateLimitOptions {
  readonly maxRequests: number;
  readonly windowSeconds: number;
  readonly keyPrefix: string;
}

function getClientIdentifier(headers: Headers): string {
  const ip =
    headers.get("cf-connecting-ip") ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const userAgent = headers.get("user-agent");
  const acceptLanguage = headers.get("accept-language");

  const fingerprint = `${ip}:${userAgent}:${acceptLanguage}`;

  // Hash for privacy - enables rate limiting without storing identifying info
  return createHash("sha256").update(fingerprint).digest("hex").slice(0, 16);
}

const createIpRateLimitHandler = (options: RateLimitOptions) => {
  return async (context: { request: Request }) => {
    const clientId = getClientIdentifier(context.request.headers);
    const key = `${options.keyPrefix}:${clientId}`;
    const current = await redis.incr(key);

    // Set expiry on first request in the window
    if (current === 1) {
      await redis.expire(key, options.windowSeconds);
    }

    if (current > options.maxRequests) {
      const ttl = await redis.ttl(key);
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded",
          retryAfter: ttl > 0 ? ttl : options.windowSeconds,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(ttl > 0 ? ttl : options.windowSeconds),
          },
        }
      );
    }
  };
};

export const waitlistRateLimitHandler = createIpRateLimitHandler({
  maxRequests: 5,
  windowSeconds: 3600, // 1 hour
  keyPrefix: "waitlist_rate_limit",
});

export const verifyAccessRateLimitHandler = createIpRateLimitHandler({
  maxRequests: 15,
  windowSeconds: 900, // 15 minutes
  keyPrefix: "verify_access_rate_limit",
});
