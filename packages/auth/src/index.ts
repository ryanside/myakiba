import "dotenv/config";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@myakiba/db";
import * as schema from "@myakiba/db/schema/auth";
import { captcha, username, openAPI } from "better-auth/plugins";
import { emailHarmony } from "better-auth-harmony";
import { Resend } from "resend";
import { createId } from "@paralleldrive/cuid2";
import Redis from "ioredis";
import { env } from "@myakiba/env/server";

const resend = new Resend(env.RESEND_API_KEY);
const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
});

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
    schema: schema,
  }),
  databaseHooks: {
    user: {
      create: {
        async before(user) {
          if (!user.username) {
            const generatedUsername = "user" + createId();
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
  trustedOrigins:
    env.CORS_ORIGIN.split(",").map((origin) => origin.trim()) || [],
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      await resend.emails.send({
        from: env.RESEND_FROM_EMAIL,
        to: user.email,
        subject: "Reset your password",
        text: `Click the link to reset your password: ${url}`,
      });
    },
    onPasswordReset: async ({ user }) => {
      console.log(`Password for user ${user.email} has been reset.`);
    },
  },
  emailVerification: {
    autoSignInAfterVerification: true,
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
        required: false,
        defaultValue: "USD",
      },
    },
  },
});

let _schema: ReturnType<typeof auth.api.generateOpenAPISchema>;
const getSchema = async () => (_schema ??= auth.api.generateOpenAPISchema());

export const OpenAPI = {
  getPaths: (prefix = "/auth/api") =>
    getSchema().then(({ paths }) => {
      const reference: typeof paths = Object.create(null);

      for (const path of Object.keys(paths)) {
        const key = prefix + path;
        reference[key] = paths[path];

        for (const method of Object.keys(paths[path])) {
          const operation = (reference[key] as any)[method];

          operation.tags = ["Better Auth"];
        }
      }

      return reference;
    }) as Promise<any>,
  components: getSchema().then(({ components }) => components) as Promise<any>,
} as const;
