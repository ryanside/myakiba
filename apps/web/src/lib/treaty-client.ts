import { env } from "@myakiba/env/web";
import { treaty } from "@elysiajs/eden";
import type { App } from "@server/index";
import { recheckSession } from "@/lib/auth-client";

export const app = treaty<App>(env.VITE_SERVER_URL, {
  parseDate: false,
  fetch: {
    credentials: "include",
  },
  onResponse: async (response) => {
    if (response.status === 401) await recheckSession();
  },
});
