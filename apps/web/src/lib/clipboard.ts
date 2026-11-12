import { Result } from "better-result";
import { ClipboardWriteFailed } from "@/lib/errors/clipboard-write-failed";

export function writeClipboard(text: string): Promise<Result<void, ClipboardWriteFailed>> {
  return Result.tryPromise({
    try: () => navigator.clipboard.writeText(text),
    catch: (cause) => new ClipboardWriteFailed({ cause }),
  });
}
