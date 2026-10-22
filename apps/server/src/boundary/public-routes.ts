import { Elysia } from "elysia";
import type { Context } from "elysia";
import * as z from "zod";
import { auth } from "@myakiba/auth/server";
import { env } from "@myakiba/env/server";
import { unavailableDependencies } from "@/lib/health";

function authResponse({ request, set }: Context) {
  return auth.handler(request).then((response) => {
    // evlog 2.27 logs `set.status || 200` and ignores a returned Response's status; remove once evlog reads it.
    set.status = response.status;
    return response;
  });
}

/** Every route that answers without a session. Everything else goes through privateApi. */
export const publicRoutes = new Elysia()
  .get("/api/auth/*", authResponse)
  .post("/api/auth/*", authResponse, { parse: "none" })
  .get("/health", async ({ status }) => {
    const unavailable = await unavailableDependencies();
    if (unavailable.length === 0) return { status: "ok" };
    return status(503, { status: `${unavailable.join(" and ")} unavailable` });
  })
  .get(
    "/api/version",
    ({ set }) => {
      set.headers["cache-control"] = "no-store";
      return { buildId: env.BUILD_ID };
    },
    {
      response: z.object({ buildId: z.string() }),
    },
  );
