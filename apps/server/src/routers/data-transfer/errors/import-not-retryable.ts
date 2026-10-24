import { Failure } from "@/domain/failure";

export class ImportNotRetryable extends Failure(
  "ImportNotRetryable",
  "conflict",
  "The import does not exist or cannot be retried in its current state.",
) {}
