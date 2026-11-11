import { Result } from "better-result";
import * as z from "zod";
import { OWNER_CHECKS, OWNER_MISMATCH } from "@myakiba/db/owner-guards";
import type { OwnerCheck } from "@myakiba/db/owner-guards";

const rejection = z.object({
  errno: z.literal(OWNER_MISMATCH),
  constraint: z.enum(Object.keys(OWNER_CHECKS) as [OwnerCheck, ...OwnerCheck[]]),
});

/** The owner check that rejected a write, read through Drizzle's wrapper to the driver's error. */
function rejectedBy(error: Error): OwnerCheck | undefined {
  for (let current: unknown = error; current instanceof Error; current = current.cause) {
    const parsed = rejection.safeParse(current);
    if (parsed.success) return parsed.data.constraint;
  }
  return undefined;
}

/**
 * Runs a write the owner guards check. When a guard rejects it with a check `failures` names,
 * which a concurrent write can cause after the operation's own read passed, it answers that
 * Failure. Any other error throws.
 */
export async function guardedWrite<T, F>(
  write: PromiseLike<T>,
  failures: Partial<Record<OwnerCheck, () => F>>,
): Promise<Result<T, F>> {
  try {
    return Result.ok(await write);
  } catch (error) {
    const check = error instanceof Error ? rejectedBy(error) : undefined;
    const failure = check === undefined ? undefined : failures[check];
    if (failure === undefined) throw error;
    return Result.err(failure());
  }
}
