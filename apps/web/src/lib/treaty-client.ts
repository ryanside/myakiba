import { env } from "@myakiba/env/web";
import { treaty } from "@elysiajs/eden";
import type { App } from "@server/index";

export const app = treaty<App>(env.VITE_SERVER_URL, {
  fetch: {
    credentials: "include",
  },
});

export function getErrorMessage(error: { status: number; value: unknown }, fallback: string): string {
  if (error.status === 422) {
    const validationError = error.value as { message?: string } | undefined;
    return validationError?.message || fallback;
  }
  return typeof error.value === "string" ? error.value : fallback;
}
