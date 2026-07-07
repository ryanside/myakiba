import { createAuthClient } from "better-auth/react";
import { adminClient, usernameClient, inferAdditionalFields } from "better-auth/client/plugins";
import { env } from "@myakiba/env/web";

export const authClient = createAuthClient({
  baseURL: env.VITE_SERVER_URL,
  plugins: [
    usernameClient(),
    adminClient(),
    inferAdditionalFields({
      user: {
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
    }),
  ],
});

export type User = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  email: string;
  emailVerified: boolean;
  name: string;
  image?: string | null | undefined;
  username?: string | null | undefined;
  displayUsername?: string | null | undefined;
  currency: string;
  dateFormat: string;
};
