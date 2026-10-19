import { env } from "@myakiba/env/web";
import { treaty } from "@elysiajs/eden";
import * as z from "zod";
import type { App } from "@server/index";

export const app = treaty<App>(env.VITE_SERVER_URL, {
  parseDate: false,
  fetch: {
    credentials: "include",
  },
});

/** Eden's error: the status and parsed body, or 503 and the thrown error when no response arrived. */
type ApiError = { readonly status: number; readonly value: unknown };

const serverMessage = z.string().min(1);

/** Only a 4xx text body is a message the server wrote for the user. Anything else shows `fallback`. */
export function getErrorMessage({ status, value }: ApiError, fallback: string): string {
  if (status < 400 || status >= 500) return fallback;
  const message = serverMessage.safeParse(value);
  return message.success ? message.data : fallback;
}
