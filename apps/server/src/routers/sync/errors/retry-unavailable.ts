import { Failure } from "@/domain/failure";

export class RetryUnavailable extends Failure(
  "RetryUnavailable",
  "conflict",
  "These failed item results cannot be retried",
) {}
