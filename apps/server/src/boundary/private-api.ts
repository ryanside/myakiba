import { Elysia } from "elysia";
import { evlog } from "evlog/elysia";
import { betterAuth } from "@/middleware/better-auth";

/**
 * Elysia parses the query of a route with a Zod schema by splitting every value at its commas and
 * JSON-parsing one wrapped in brackets, so a search for "," arrives as `["", ""]`.
 * Here a key sent once keeps its text, and a repeated key becomes a list.
 */
function queryFromUrl(url: string): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = Object.create(null);
  for (const [key, value] of new URL(url).searchParams) {
    const sent = query[key];
    query[key] = sent === undefined ? value : [sent, value].flat();
  }
  return query;
}

/** Every route on this instance, and on every plugin it uses, answers 401 without a session. */
export function privateApi<const Prefix extends string>(prefix: Prefix) {
  return new Elysia({ prefix })
    .onTransform((ctx) => {
      // Elysia types the query before validation as strings only, though its own parser yields lists too.
      Object.assign(ctx, { query: queryFromUrl(ctx.request.url) });
    })
    .use(betterAuth)
    .use(evlog())
    .guard({ auth: true });
}
