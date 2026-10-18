import { Elysia } from "elysia";
import * as z from "zod";
import { auth } from "@myakiba/auth/server";
import { env } from "@myakiba/env/server";
import { unavailableDependencies } from "@/lib/health";

/** Every route that answers without a session. Everything else goes through privateApi. */
export const publicRoutes = new Elysia()
  .get("/api/auth/*", ({ request }) => auth.handler(request))
  .post("/api/auth/*", ({ request }) => auth.handler(request), {
    parse: "none",
  })
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
