import { env } from "@myakiba/env/web";
import { treaty } from "@elysiajs/eden";
import type { App } from "@server/index";
import * as z from "zod";

export const app = treaty<App>(env.VITE_SERVER_URL, {
  fetch: {
    credentials: "include",
  },
  parseDate: false,
});

const validationErrorSchema = z.object({ message: z.string().optional() });
export function getErrorMessage(
  error: { status: number; value: unknown },
  fallback: string,
): string {
  if (error.status === 422) {
    const validationError = validationErrorSchema.safeParse(error.value);
    if (validationError.success && validationError.data.message) {
      return validationError.data.message;
    }
    return fallback;
  }
  return typeof error.value === "string" ? error.value : fallback;
}
