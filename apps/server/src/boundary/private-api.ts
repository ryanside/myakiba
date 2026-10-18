import { Elysia } from "elysia";
import { evlog } from "evlog/elysia";
import { betterAuth } from "@/middleware/better-auth";

/** Every route on this instance, and on every plugin it uses, answers 401 without a session. */
export function privateApi<const Prefix extends string>(prefix: Prefix) {
  return new Elysia({ prefix }).use(betterAuth).use(evlog()).guard({ auth: true });
}
