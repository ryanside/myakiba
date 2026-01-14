import { createAuthClient } from "better-auth/react";
import {
  usernameClient,
  inferAdditionalFields,
} from "better-auth/client/plugins";
import { env } from "@myakiba/env/web";

export const authClient = createAuthClient({
  baseURL: env.VITE_SERVER_URL,
  plugins: [
    usernameClient(),
    inferAdditionalFields({
      user: {
        currency: {
          type: "string",
          required: false,
          defaultValue: "USD",
        },
      },
    }),
  ],
});
