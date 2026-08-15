import { env } from "@myakiba/env/web";
import { treaty } from "@elysiajs/eden";
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
