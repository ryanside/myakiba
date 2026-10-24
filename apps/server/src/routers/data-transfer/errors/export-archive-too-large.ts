import { Failure } from "@/domain/failure";

export class ExportArchiveTooLarge extends Failure(
  "ExportArchiveTooLarge",
  "payload_too_large",
  "The export exceeds the 50 MiB limit.",
) {}
