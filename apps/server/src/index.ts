import "dotenv/config";
import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { auth } from "./lib/auth";
import { helmet } from 'elysia-helmet';
import logixlysia from 'logixlysia'
import { sync } from "./routers/sync";

const app = new Elysia()
  .use(
    cors({
      origin: process.env.CORS_ORIGIN || "",
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    })
  )
  .all("/api/auth/*", async (context) => {
    const { request } = context;
    if (["POST", "GET"].includes(request.method)) {
      return auth.handler(request);
    }
    context.status(405);
  })
  .use(helmet())
  .use(logixlysia())
  .use(sync)
  .get("/hi", () => "Hi Elysia")
  .listen(3000);

export type App = typeof app;


