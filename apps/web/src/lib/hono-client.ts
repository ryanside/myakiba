import type { AppType } from "@server/index";
import { hc } from "hono/client";
import { env } from "@myakiba/env/web";

export const client = hc<AppType>(env.VITE_SERVER_URL, {
  fetch: ((input, init) => {
    return fetch(input, {
      ...init,
      credentials: "include", // Required for sending cookies cross-origin
    });
  }) as typeof fetch,
});
