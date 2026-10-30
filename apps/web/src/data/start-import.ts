import { Result } from "better-result";
import { requireExtension } from "@/lib/extension-gate";
import type { ExtensionMissing } from "@/lib/extension-gate";

/**
 * The one way a write that starts an Item Refresh runs. It asks for the extension first, so a refused
 * refresh writes nothing and shows the notice that says why. The write's own success handling
 * starts the extension on what it left to fetch, so a defect there fails the write.
 */
export async function startImport<Output, Failure>(
  write: () => Promise<Result<Output, Failure>>,
): Promise<Result<Output, Failure | ExtensionMissing>> {
  const ready = await requireExtension();
  if (ready.isErr()) return Result.err(ready.error);
  return write();
}
