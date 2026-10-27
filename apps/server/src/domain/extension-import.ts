import { Result } from "better-result";
import { EXTENSION_RELEASE } from "@myakiba/contracts/shared/extension-release";
import { ExtensionImportUnavailable } from "@/lib/errors/extension-import-unavailable";
import { gate } from "./kernel";
import type { Op } from "./kernel";
import type { AnyFailure } from "./failure";

/** All extension import operations share this release decision, before any preparation. */
export function gated<I, T, F extends AnyFailure, M extends string>(op: Op<I, T, F, M>) {
  return gate(op, () =>
    EXTENSION_RELEASE === "in_review" ? Result.err(new ExtensionImportUnavailable()) : Result.ok(),
  );
}
