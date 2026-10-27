import { Result } from "better-result";
import type { RequestLogger } from "evlog";
import { logOperationError, run } from "@/domain/kernel";
import type { Op } from "@/domain/kernel";
import type { AnyFailure } from "@/domain/failure";
import type { Viewer } from "@/domain/viewer";
import { StreamReadFailed } from "./errors/stream-read-failed";

export type { StreamReadFailed } from "./errors/stream-read-failed";

export async function readStream<I, T, F extends AnyFailure, M extends string>(
  caller: { readonly viewer: Viewer; readonly log: RequestLogger },
  op: Op<I, T, F, M>,
  input: NoInfer<I>,
): Promise<Result<T, F | StreamReadFailed>> {
  try {
    const result = await run(caller.viewer, op, input, caller.log);
    caller.log.set({
      outcome: result.isErr()
        ? result.error.category
        : (caller.log.getContext().outcome ?? "success"),
    });
    return result;
  } catch (error) {
    logOperationError(
      caller.log,
      op.action,
      error instanceof Error ? error : new Error(String(error)),
    );
    return Result.err(new StreamReadFailed({ cause: error }));
  }
}
