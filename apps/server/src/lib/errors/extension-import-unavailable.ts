import { Failure } from "@/domain/failure";

export class ExtensionImportUnavailable extends Failure(
  "ExtensionImportUnavailable",
  "conflict",
  "Importing is unavailable until the browser extension is released.",
) {}
