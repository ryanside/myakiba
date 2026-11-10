// @better-auth/infra puts jose types in the type of `auth`. Without this
// reference tsc cannot name them in the declaration (TS2883).
/// <reference types="jose" />
import "dotenv/config";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getSessionCookie } from "better-auth/cookies";
import { db } from "@myakiba/db/client";
import * as schema from "@myakiba/db/schema/auth";
import { admin, captcha, username, openAPI } from "better-auth/plugins";
import { emailHarmony } from "better-auth-harmony";
import { Resend } from "resend";
import { createId } from "@paralleldrive/cuid2";
import { redis } from "@myakiba/redis/client";
import { incrementWithTtl } from "@myakiba/redis/counter";
import { env } from "@myakiba/env/server";
import { dash } from "@better-auth/infra";
import { z } from "zod";
import { CURRENCIES, DATE_FORMATS } from "@myakiba/contracts/shared/constants";
import { WRITE_LIMITS } from "@myakiba/contracts/shared/write-limits";

import { accessSessionStore } from "./session-store";
import { sendAuthEmail } from "./send-auth-email";

const resend = new Resend(env.RESEND_API_KEY);

/** Better Auth leaves a user's name and image unbounded, and every session read loads them. */
const profileTextSchema = z.looseObject({
  name: z
    .string()
    .max(WRITE_LIMITS.name, `Name is longer than ${WRITE_LIMITS.name} characters`)
    .optional(),
  image: z
    .string()
    .max(WRITE_LIMITS.imageUrl, `Image URL is longer than ${WRITE_LIMITS.imageUrl} characters`)
    .nullish(),
});

const capProfileText = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/sign-up/email" && ctx.path !== "/update-user") return;
  const parsed = profileTextSchema.safeParse(ctx.body ?? {});
  if (parsed.success) return;
  throw new APIError("BAD_REQUEST", {
    code: "VALIDATION_ERROR",
    message: parsed.error.issues[0]?.message ?? "Invalid profile",
  });
});

export const auth = betterAuth({
  appName: "myakiba",
  secondaryStorage: {
    get: async (key) => {
      return await accessSessionStore("get", () => redis.get(key));
    },
    set: async (key, value, ttl) => {
      await accessSessionStore("set", () =>
        ttl ? redis.set(key, value, "EX", ttl) : redis.set(key, value),
      );
    },
    delete: async (key) => {
      await accessSessionStore("delete", () => redis.del(key));
    },
    getAndDelete: async (key) => {
      return await redis.getdel(key);
    },
    increment: async (key, ttl) => {
      return await incrementWithTtl(redis, key, ttl);
    },
  },
  advanced: {
    database: {
      joins: true,
    },
    // Cloudflare sets cf-connecting-ip and overwrites a client's copy; a client sets
    // X-Forwarded-For to anything. Without the header, dev and tests share 127.0.0.1.
    ipAddress: {
      ipAddressHeaders: ["cf-connecting-ip"],
    },
  },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  databaseHooks: {
    user: {
      create: {
        async before(user) {
          if (!user.username) {
            const generatedUsername = `user${createId()}`;
            return {
              data: {
                ...user,
                username: generatedUsername,
              },
            };
          }
          return { data: user };
        },
      },
    },
  },
  hooks: {
    before: capProfileText,
  },
  trustedOrigins: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()) || [],
  rateLimit: {
    enabled: true,
    storage: "secondary-storage",
    customRules: {
      "/send-verification-email": { window: 60, max: 1 },
      "/request-password-reset": { window: 60, max: 3 },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await sendAuthEmail(resend, "reset", {
        from: env.RESEND_FROM_EMAIL,
        to: user.email,
        subject: "Reset your password",
        text: `Click the link to reset your password: ${url}`,
      });
    },
  },
  emailVerification: {
    autoSignInAfterVerification: true,
    sendOnSignUp: true,
    sendOnSignIn: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendAuthEmail(resend, "verification", {
        from: env.RESEND_FROM_EMAIL,
        to: user.email,
        subject: "Verify your email address",
        text: `Click the link to verify your email: ${url}`,
      });
    },
  },
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
  },
  plugins: [
    captcha({
      provider: "cloudflare-turnstile",
      secretKey: env.TURNSTILE_SECRET_KEY,
      // Every endpoint that checks a password or sends mail without a session or a mailed token.
      endpoints: [
        "/sign-up/email",
        "/sign-in/email",
        "/sign-in/username",
        "/request-password-reset",
        "/send-verification-email",
      ],
    }),
    username(),
    emailHarmony({}),
    // The reference page loads an unpinned script from a CDN, so it stays off the production origin.
    ...(env.NODE_ENV === "production" ? [] : [openAPI()]),
    admin(),
    ...(env.BETTER_AUTH_API_KEY
      ? [
          dash({
            apiKey: env.BETTER_AUTH_API_KEY,
          }),
        ]
      : []),
  ],
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  session: {
    // Dash defaults an omitted value to true during plugin initialization. Set
    // false explicitly so Better Auth and Dash both use Redis-only sessions.
    // See https://github.com/better-auth/better-auth/issues/9370
    storeSessionInDatabase: false,
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
      strategy: "jwe",
    },
  },
  user: {
    deleteUser: {
      enabled: true,
    },
    additionalFields: {
      hasSeenOnboarding: {
        type: "boolean",
        required: false,
        defaultValue: false,
      },
      currency: {
        type: "string",
        required: true,
        defaultValue: "USD",
        validator: { input: z.enum(CURRENCIES) },
      },
      dateFormat: {
        type: "string",
        required: true,
        defaultValue: "MM/DD/YYYY",
        validator: { input: z.enum(DATE_FORMATS) },
      },
    },
  },
});

/** Whether a request carries a session cookie at all, valid or not. */
export const hasSessionCookie = (headers: Headers): boolean => getSessionCookie(headers) !== null;

type OpenAPISchema = Awaited<ReturnType<typeof auth.api.generateOpenAPISchema>>;
type OpenAPIOperation = { tags?: string[] };
// Intentionally loose: `better-auth` and `@elysiajs/openapi` describe OpenAPI
// shapes that do not assign to each other, so the consumer re-assigns via
// structural duck-typing.
type OpenAPIPaths = Record<string, Record<string, OpenAPIOperation>>;
type OpenAPIComponents = NonNullable<OpenAPISchema["components"]>;

let schemaPromise: ReturnType<typeof auth.api.generateOpenAPISchema> | undefined;
const getSchema = async (): Promise<OpenAPISchema> => {
  schemaPromise ??= auth.api.generateOpenAPISchema();
  try {
    return await schemaPromise;
  } catch (error) {
    schemaPromise = undefined;
    throw error;
  }
};

export const OpenAPI = {
  getPaths: async (prefix = "/auth/api"): Promise<OpenAPIPaths> => {
    const { paths } = await getSchema();
    const reference: OpenAPIPaths = Object.create(null);

    for (const path of Object.keys(paths)) {
      const key = prefix + path;
      const pathItem = paths[path] as Record<string, OpenAPIOperation>;
      reference[key] = pathItem;

      for (const method of Object.keys(pathItem)) {
        const operation = pathItem[method];

        if (operation) operation.tags = ["Better Auth"];
      }
    }

    return reference;
  },
  components: async (): Promise<OpenAPIComponents> => {
    const { components } = await getSchema();
    return components as OpenAPIComponents;
  },
} as const;
