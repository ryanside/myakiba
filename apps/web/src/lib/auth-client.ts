import { createAuthClient } from "better-auth/react";
import { adminClient, usernameClient, inferAdditionalFields } from "better-auth/client/plugins";
import type { auth } from "@myakiba/auth/server";
import { env } from "@myakiba/env/web";

export const authClient = createAuthClient({
  baseURL: env.VITE_SERVER_URL,
  plugins: [usernameClient(), adminClient(), inferAdditionalFields<typeof auth>()],
});

export type User = typeof authClient.$Infer.Session.user;
