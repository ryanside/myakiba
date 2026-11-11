import { createLogger, initLogger, log } from "evlog";
import type { DrainContext } from "evlog";
import { createPostHogDrain } from "evlog/posthog";
import { createDrainPipeline } from "evlog/pipeline";
import { OpenAPI } from "@myakiba/auth/server";
import { env } from "@myakiba/env/server";
import { createApp } from "./app";
import type { OpenAPIDocumentation } from "./app";

const pipeline = createDrainPipeline<DrainContext>({
  batch: { size: 50, intervalMs: 5000 },
  retry: { maxAttempts: 3 },
});
const drain = env.POSTHOG_API_KEY
  ? pipeline(
      createPostHogDrain({
        apiKey: env.POSTHOG_API_KEY,
      }),
    )
  : undefined;
initLogger({ env: { service: "api" }, drain });

let exitingAfterFatal = false;
function handleFatal(kind: "uncaughtException" | "unhandledRejection", cause: unknown): void {
  if (exitingAfterFatal) return;
  exitingAfterFatal = true;
  const fatalLog = createLogger({ action: `server.${kind}`, outcome: "error" });
  fatalLog.error(cause instanceof Error ? cause : new Error(String(cause)));
  fatalLog.emit();
  const deadline = setTimeout(() => process.exit(1), 5000);
  void (async () => {
    try {
      await drain?.flush();
    } catch (error) {
      const flushLog = createLogger({ action: "server.fatalFlush", outcome: "error" });
      flushLog.error(error instanceof Error ? error : new Error(String(error)));
      flushLog.emit();
    } finally {
      clearTimeout(deadline);
      process.exit(1);
    }
  })();
}
process.on("uncaughtException", (cause: Error) => handleFatal("uncaughtException", cause));
process.on("unhandledRejection", (cause: unknown) => handleFatal("unhandledRejection", cause));

log.info({
  msg: "server booting",
  buildId: env.BUILD_ID,
  nodeEnv: env.NODE_ENV,
  optionals: {
    posthog: env.POSTHOG_API_KEY !== undefined,
    betterAuthDashboard: env.BETTER_AUTH_API_KEY !== undefined,
  },
});

const includeAuthDocs = env.OPENAPI_AUTH_DOCS && env.NODE_ENV !== "production";
const authDocs: OpenAPIDocumentation | undefined = includeAuthDocs
  ? ({
      components: await OpenAPI.components(),
      paths: await OpenAPI.getPaths(),
    } as OpenAPIDocumentation)
  : undefined;

log.info({ msg: "auth docs resolved", includeAuthDocs });

const app = createApp({ drain, authDocs }).listen(3000, () => {
  log.info({
    msg: "server started",
    port: 3000,
    url: "http://localhost:3000",
  });
});

export type App = typeof app;
