import { isTaggedError, Panic, UnhandledException } from "better-result";

/** What a screen shows for a defect, whose own message is never shown. */
export const DEFECT_TEXT = "Something went wrong. Reload the page and try again";

/**
 * A thrown value as a defect whose `message` is the safe text, so any screen may show it. What
 * was thrown stays in `cause`, and the Panic's stack ends with the cause's, for the log.
 */
export function asPanic(cause: unknown): Panic {
  if (Panic.is(cause) && cause.message === DEFECT_TEXT) return cause;
  return new Panic({ message: DEFECT_TEXT, cause });
}

/**
 * A declared failure stays itself. Anything else is a defect: a Panic, an UnhandledException,
 * whose message embeds what was thrown, an untagged error, a non-error.
 */
export function asFailure<Failure>(cause: Failure): Failure | Panic {
  return isTaggedError(cause) && !Panic.is(cause) && !UnhandledException.is(cause)
    ? cause
    : asPanic(cause);
}

/** Logs a defect with what was thrown, since the defect's own message is the safe text. */
export function reportDefect(cause: unknown): void {
  const defect = asPanic(cause);
  console.error(defect, defect.cause);
}
