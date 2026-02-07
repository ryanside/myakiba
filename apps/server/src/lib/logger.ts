import { env } from "@myakiba/env/server";

type LogLevel = "info" | "error";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

/** A log field value: any JSON-serializable value, or an Error (auto-serialized). */
type LogValue = JsonValue | Error;

/** Arbitrary structured context to attach to a log entry. */
type LogFields = Readonly<Record<string, LogValue>>;

interface Logger {
  readonly info: (fields: LogFields) => void;
  readonly error: (fields: LogFields) => void;
}

/**
 * Converts an Error instance into a plain JSON-serializable object
 * capturing message, name, and stack trace.
 */
function serializeError(error: Error): { message: string; name: string; stack: string | null } {
  return {
    message: error.message,
    name: error.name,
    stack: error.stack ?? null,
  };
}

/**
 * Walks top-level fields and serializes any Error instances into
 * plain objects so the entire record is JSON-safe.
 */
function processFields(fields: LogFields): Record<string, JsonValue> {
  const processed: Record<string, JsonValue> = {};

  for (const [key, value] of Object.entries(fields)) {
    if (value instanceof Error) {
      processed[key] = serializeError(value);
    } else {
      processed[key] = value;
    }
  }

  return processed;
}

/**
 * Creates a structured JSON logger for a given service.
 *
 * Every entry automatically includes `timestamp`, `level`, `service`,
 * and `build_id`. Callers supply arbitrary context via `LogFields`.
 *
 * - `info`  writes to **stdout**
 * - `error` writes to **stderr**
 */
function createLogger(service: string): Logger {
  const baseFields = {
    service,
    build_id: env.BUILD_ID,
  };

  const emit = (level: LogLevel, fields: LogFields): void => {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      ...baseFields,
      ...processFields(fields),
    };

    const line = JSON.stringify(entry) + "\n";

    if (level === "error") {
      process.stderr.write(line);
    } else {
      process.stdout.write(line);
    }
  };

  return {
    info: (fields: LogFields): void => emit("info", fields),
    error: (fields: LogFields): void => emit("error", fields),
  };
}

/** Singleton logger for the API server. */
export const logger = createLogger("api");

export { createLogger, serializeError };
export type { Logger, LogFields, LogValue, JsonValue };
