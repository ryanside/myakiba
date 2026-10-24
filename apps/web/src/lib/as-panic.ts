import { Panic } from "better-result";

/** A thrown value as a defect: a Panic stays itself, and anything else becomes a Panic that keeps its message. */
export function asPanic(cause: unknown): Panic {
  if (Panic.is(cause)) return cause;
  return new Panic({ message: cause instanceof Error ? cause.message : String(cause), cause });
}
