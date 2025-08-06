import type { AppType } from "@server/index";
import { hc } from "hono/client";

export const client = hc<AppType>(import.meta.env.VITE_SERVER_URL, {
  fetch: ((input, init) => {
    return fetch(input, {
      ...init,
      credentials: "include", // Required for sending cookies cross-origin
    });
  }) satisfies typeof fetch,
});
