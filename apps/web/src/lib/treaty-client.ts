import { env } from "@myakiba/env/web";
import { treaty } from "@elysiajs/eden";
import type { App } from "@server/index";
import {
  normalizeEdenDateFields,
  type EdenDateNormalizable,
  type EdenDateNormalizableObject,
} from "@/lib/eden-date-normalizer";

type RequestBodyCandidate = RequestInit["body"] | EdenDateNormalizable | null;

const isPlainObjectValue = (
  value: RequestBodyCandidate,
): value is EdenDateNormalizableObject => {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  if (value instanceof Date) return false;
  return Object.prototype.toString.call(value) === "[object Object]";
};

const isJsonResponse = (response: Response): boolean => {
  const contentType = response.headers
    .get("Content-Type")
    ?.split(";")[0]
    ?.trim();
  return contentType === "application/json";
};

const shouldParseJsonString = (value: string): boolean => {
  const trimmed = value.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
};

const parseJsonValue = (value: string): EdenDateNormalizable | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as EdenDateNormalizable;
  } catch {
    return null;
  }
};

const normalizeJsonString = (value: string): string => {
  if (!shouldParseJsonString(value)) return value;
  const parsed = parseJsonValue(value);
  if (parsed === null) return value;
  const normalized = normalizeEdenDateFields(parsed);
  return JSON.stringify(normalized);
};

const normalizeRequestBody = (
  body: RequestBodyCandidate | undefined,
): RequestInit["body"] | EdenDateNormalizable | null | undefined => {
  if (!body) return body;

  if (typeof body === "string") {
    return normalizeJsonString(body);
  }

  if (Array.isArray(body) || isPlainObjectValue(body)) {
    return normalizeEdenDateFields(body as EdenDateNormalizable);
  }

  return body;
};

export const app = treaty<App>(env.VITE_SERVER_URL, {
  fetch: {
    credentials: "include",
  },
  onResponse: async (response) => {
    if (!response.ok || !isJsonResponse(response)) return undefined;
    const text = await response.text();
    const parsed = parseJsonValue(text);
    if (parsed === null) return undefined;
    return normalizeEdenDateFields(parsed);
  },
  onRequest: (_, options) => ({
    body: normalizeRequestBody(options.body) as RequestInit["body"],
  }),
});

export function getErrorMessage(
  error: { status: number; value: unknown },
  fallback: string,
): string {
  if (error.status === 422) {
    const validationError = error.value as { message?: string } | undefined;
    return validationError?.message || fallback;
  }
  return typeof error.value === "string" ? error.value : fallback;
}
