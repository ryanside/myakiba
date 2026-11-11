import { Result } from "better-result";
import * as z from "zod";
import { OWNER_CHECKS, OWNER_MISMATCH } from "@myakiba/db/owner-guards";
import type { OwnerCheck } from "@myakiba/db/owner-guards";

const rejection = z.object({
  errno: z.literal(OWNER_MISMATCH),
  constraint: z.enum(Object.keys(OWNER_CHECKS) as [OwnerCheck, ...OwnerCheck[]]),
});

// Drizzle wraps the driver's error, so the guard's rejection is on a cause.
function rejectedBy(error: Error): OwnerCheck | undefined {
  for (let current: unknown = error; current instanceof Error; current = current.cause) {
    const parsed = rejection.safeParse(current);
    if (parsed.success) return parsed.data.constraint;
  }
  return undefined;
}

// A concurrent write, such as an Item Refresh deleting a release, can make a guard reject a write
// after the operation's own read passed. Any other rejection is a broken invariant and throws.
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
