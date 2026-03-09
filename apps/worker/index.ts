import { createLogger, initLogger, log } from "evlog";
import { tryCatch } from "@myakiba/utils";
import { drain } from "./lib/evlog";
import { env } from "@myakiba/env/worker";

type ShutdownSignal = "SIGINT" | "SIGTERM";

let closeWorker: (() => Promise<void>) | null = null;
let isShuttingDown = false;

async function shutdown(signal: ShutdownSignal, exitCode: number): Promise<void> {
  if (isShuttingDown) return;

  isShuttingDown = true;

  try {
    log.info({
      action: "worker.shutdown",
      outcome: "success",
      signal,
    });

    const { error } = await tryCatch(closeWorker ? closeWorker() : Promise.resolve());
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
closeWorker = workerModule.closeWorker;

process.once("SIGINT", () => {
  void shutdown("SIGINT", 0);
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM", 0);
});
