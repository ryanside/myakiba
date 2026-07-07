import "dotenv/config";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@myakiba/db/client";
import * as schema from "@myakiba/db/schema/auth";
import { admin, captcha, username, openAPI } from "better-auth/plugins";
import { emailHarmony } from "better-auth-harmony";
import { Resend } from "resend";
import { createId } from "@paralleldrive/cuid2";
import { redis } from "@myakiba/redis/client";
import { env } from "@myakiba/env/server";

const resend = new Resend(env.RESEND_API_KEY);

export const auth = betterAuth({
  secondaryStorage: {
    get: async (key) => {
      return await redis.get(key);
    },
    set: async (key, value, ttl) => {
      if (ttl) await redis.set(key, value, "EX", ttl);
      else await redis.set(key, value);
    },
    delete: async (key) => {
      await redis.del(key);
    },
  },
  experimental: {
    joins: true,
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
  trustedOrigins: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()) || [],
  rateLimit: {
    enabled: true,
    storage: "secondary-storage",
    customRules: {
      "/send-verification-email": { window: 60, max: 1 },
      "/forget-password": { window: 60, max: 3 },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await resend.emails.send({
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
      await resend.emails.send({
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
    }),
    username(),
    emailHarmony({}),
    openAPI(),
    admin(),
  ],
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day (every 1 day the session expiration is updated)
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // Cache duration in seconds
    },
  },
  user: {
    deleteUser: {
      enabled: true,
    },
    additionalFields: {
      currency: {
        type: "string",
        required: true,
        defaultValue: "USD",
      },
      dateFormat: {
        type: "string",
        required: true,
        defaultValue: "MM/DD/YYYY",
      },
    },
  },
});

type OpenAPISchema = Awaited<ReturnType<typeof auth.api.generateOpenAPISchema>>;
type OpenAPIOperation = { tags?: string[] };
// Intentionally loose: `better-auth` and `@elysiajs/openapi` describe OpenAPI
// shapes that do not assign to each other, so the consumer re-assigns via
// structural duck-typing.
type OpenAPIPaths = Record<string, Record<string, OpenAPIOperation>>;
type OpenAPIComponents = Record<string, object>;

let schemaPromise: ReturnType<typeof auth.api.generateOpenAPISchema> | undefined;
const getSchema = async (): Promise<OpenAPISchema> => {
  schemaPromise ??= auth.api.generateOpenAPISchema();
  return await schemaPromise;
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
  components: (async (): Promise<OpenAPIComponents> => {
    const { components } = await getSchema();
    return components as OpenAPIComponents;
  })(),
} as const;
