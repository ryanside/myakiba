import { createLogger, initLogger, log } from "evlog";
import { tryCatch } from "@myakiba/utils/result";
import { drain } from "./lib/evlog";
import { env } from "@myakiba/env/worker";

type ShutdownSignal = "SIGINT" | "SIGTERM";

let isShuttingDown = false;

async function shutdown(signal: ShutdownSignal, initialExitCode: number): Promise<void> {
  if (isShuttingDown) return;

  isShuttingDown = true;

  let exitCode = initialExitCode;
  try {
    log.info({
      action: "worker.shutdown",
      outcome: "success",
      signal,
    });

    healthServer.stop(true);

    const { error } = await tryCatch(closeWorker());
    if (error) {
      if (error instanceof Error) {
        const shutdownLog = createLogger({
          action: "worker.shutdown",
          outcome: "error",
          signal,
        });

        shutdownLog.error(error);
        shutdownLog.emit();
      }

      exitCode = 1;
    }
  } finally {
    if (drain) await drain.flush();
    process.exit(exitCode);
  }
}

initLogger({
  env: { service: "worker", environment: env.NODE_ENV },
  drain,
});

log.info({
  action: "worker.boot",
  outcome: "success",
  runtime: { nodeEnv: env.NODE_ENV },
  optionals: {
    proxied: env.WORKER_PROXY_URL !== undefined,
    posthog: env.POSTHOG_API_KEY !== undefined,
  },
});

const { data: workerModule, error } = await tryCatch(import("./worker"));
if (error) {
  const startupError = error instanceof Error ? error : new Error(String(error));

  const startupLog = createLogger({
    action: "worker.boot",
    outcome: "error",
  });

  startupLog.error(startupError);
  startupLog.emit();

  if (drain) await drain.flush();
  throw startupError;
}
const closeWorker = workerModule.closeWorker;
const healthServer = Bun.serve({
  hostname: "127.0.0.1",
  port: 3002,
  fetch(request) {
    if (new URL(request.url).pathname !== "/health") return new Response(null, { status: 404 });

    const healthy =
      !isShuttingDown &&
      workerModule.redis.status === "ready" &&
      workerModule.workerConsumers.every(
        (consumer) => consumer.isRunning() && !consumer.isPaused(),
      );

    return new Response(null, {
      status: healthy ? 200 : 503,
    });
  },
});

process.once("SIGINT", () => {
  void shutdown("SIGINT", 0);
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM", 0);
});

function handleFatalError(kind: "uncaughtException" | "unhandledRejection", cause: unknown): void {
  if (isShuttingDown) return;

  const fatalLog = createLogger({
    action: `worker.${kind}`,
    outcome: "error",
  });

  if (cause instanceof Error) {
    fatalLog.error(cause);
  } else {
    fatalLog.error(new Error(String(cause)));
  }
  fatalLog.emit();

  isShuttingDown = true;
  void (async () => {
    if (drain) await drain.flush();
    process.exit(1);
  })();
}

process.on("uncaughtException", (err: Error) => {
  handleFatalError("uncaughtException", err);
});

process.on("unhandledRejection", (cause: unknown) => {
  handleFatalError("unhandledRejection", cause);
});
