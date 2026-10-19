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

type InternalApiError =
  | {
      readonly status: 422;
      readonly value: { readonly message?: string };
    }
  | {
      readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 500;
      readonly value: string;
    };

export function getErrorMessage(error: InternalApiError, fallback: string): string {
  if (error.status === 422) {
    return error.value.message || fallback;
  }

  return error.value || fallback;
}

/** Eden's error: the status and parsed body, or 503 and the thrown error when no response arrived. */
type ApiError = { readonly status: number; readonly value: unknown };

/** A visible character: not whitespace and not an invisible format character such as U+200B. */
const serverMessage = z.string().regex(/[^\s\p{Cf}]/u);

/** Only a 4xx text body with visible text is a message the server wrote for the user. Anything else shows `fallback`. */
export function getUserErrorMessage({ status, value }: ApiError, fallback: string): string {
  if (status < 400 || status >= 500) return fallback;
  const message = serverMessage.safeParse(value);
  return message.success ? message.data : fallback;
}
