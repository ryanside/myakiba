import { createLogger } from "evlog";

export function logConnectionError(error: Error): void {
  const connectionLog = createLogger({ action: "redis.connection", outcome: "error" });
  connectionLog.error(error);
  connectionLog.emit();
}
