import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db";
import * as schema from "../db/schema/auth";
import { captcha, username } from "better-auth/plugins";
import { emailHarmony } from "better-auth-harmony";
import { Resend } from "resend";
// import { EmailTemplate } from "../emails/email-template";

const resend = new Resend(process.env.RESEND_API_KEY);

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: schema,
  }),
  trustedOrigins: [process.env.CORS_ORIGIN || ""],
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      await resend.emails.send({
        from: process.env.NODE_ENV === "production"
          ? "myakiba <noreply@myakiba.app>"
          : "myakiba <onboarding@resend.dev>",
        to: user.email,
        subject: "Reset your password",
        text: `Click the link to reset your password: ${url}`,
        // react: EmailTemplate({ firstName: user.name }),
      });
    },
    onPasswordReset: async ({ user }) => {
      // your logic here
      console.log(`Password for user ${user.email} has been reset.`);
    },
  },
  emailVerification: {
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await resend.emails.send({
        from: process.env.NODE_ENV === "production"
          ? "myakiba <noreply@myakiba.app>"
          : "myakiba <onboarding@resend.dev>",
        to: user.email,
        subject: "Verify your email address",
        text: `Click the link to verify your email: ${url}`,
      });
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  plugins: [
    captcha({
      provider: "cloudflare-turnstile",
      secretKey: process.env.TURNSTILE_SECRET_KEY!,
    }),
    username(),
    emailHarmony({}),
  ],
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
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
