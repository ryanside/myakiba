import { Failure } from "@/domain/failure";

export class ImportArchiveTooLarge extends Failure(
  "ImportArchiveTooLarge",
  "payload_too_large",
  "The import archive exceeds the 50 MiB limit.",
) {}
