import { Result } from "better-result";
import { createLogger, initLogger, log } from "evlog";
import { drain } from "./lib/evlog";
import { WorkerBootFailed } from "./lib/errors/worker-boot-failed";
import { WorkerShutdownFailed } from "./lib/errors/worker-shutdown-failed";
import { env } from "@myakiba/env/worker";

type ShutdownSignal = "SIGINT" | "SIGTERM";

let isShuttingDown = false;

async function shutdownStage(
  stage: "health" | "consumers" | "flush",
  run: () => Promise<void>,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const completed = await Result.tryPromise({
    try: () =>
      Promise.race([
        Promise.resolve().then(run),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("Shutdown stage exceeded 5000 ms")), 5000);
        }),
      ]),
    catch: (cause) => new WorkerShutdownFailed({ stage, cause }),
  });
  clearTimeout(timer);
  if (completed.isOk()) return true;
  const shutdownLog = createLogger({
    action: "worker.shutdown",
    outcome: "error",
    stage,
    failure: completed.error._tag,
  });
  shutdownLog.error(completed.error);
  shutdownLog.emit();
  return false;
}

async function shutdown(signal: ShutdownSignal, initialExitCode: number): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  log.info({ action: "worker.shutdown", outcome: "success", signal });
  let exitCode = initialExitCode;
  if (
    !(await shutdownStage("health", async () => {
      await healthServer.stop(true);
    }))
  )
    exitCode = 1;
  if (
    !(await shutdownStage("consumers", async () => {
      await closeWorker();
    }))
  )
    exitCode = 1;
  if (
    !(await shutdownStage("flush", async () => {
      await drain?.flush();
    }))
  )
    exitCode = 1;
  process.exit(exitCode);
}

initLogger({
  env: { service: "worker", environment: env.NODE_ENV },
  drain,
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
    await shutdownStage("flush", async () => {
      await drain?.flush();
    });
    process.exit(1);
  })();
}

process.on("uncaughtException", (err: Error) => {
  handleFatalError("uncaughtException", err);
});

process.on("unhandledRejection", (cause: unknown) => {
  handleFatalError("unhandledRejection", cause);
});

log.info({
  action: "worker.boot",
  outcome: "success",
  runtime: { nodeEnv: env.NODE_ENV },
  optionals: {
    posthog: env.POSTHOG_API_KEY !== undefined,
  },
});

const booted = await Result.tryPromise({
  try: () => import("./worker"),
  catch: (cause) => new WorkerBootFailed({ cause }),
});
if (booted.isErr()) {
  const { cause } = booted.error;
  const startupError = cause instanceof Error ? cause : new Error(String(cause));

  const startupLog = createLogger({
    action: "worker.boot",
    outcome: "error",
  });

  startupLog.error(startupError);
  startupLog.emit();

  if (drain) await drain.flush();
  throw startupError;
}
const workerModule = booted.value;
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
