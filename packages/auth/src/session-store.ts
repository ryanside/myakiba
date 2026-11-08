import { Result } from "better-result";
import { createLogger } from "evlog";
import { SessionStoreUnavailable } from "./errors/session-store-unavailable";

/** Better Auth owns the rejection mapping; retain it while reporting the storage outage. */
export async function accessSessionStore<T>(
  operation: "get" | "set" | "delete",
  run: () => Promise<T>,
): Promise<T> {
  const result = await Result.tryPromise({
    try: run,
    catch: (cause) => new SessionStoreUnavailable({ operation, cause }),
  });
  if (result.isOk()) return result.value;
  const storageLog = createLogger({ action: "auth.sessionStore", outcome: "error", operation });
  storageLog.error(result.error);
  storageLog.emit();
  throw result.error.cause;
}
