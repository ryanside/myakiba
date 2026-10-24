import { Failure } from "@/domain/failure";
import { SYNC_SESSION_RETRY_WINDOW_DAYS } from "@myakiba/contracts/sync/constants";

export class RetryWindowExpired extends Failure(
  "RetryWindowExpired",
  "conflict",
  `The ${SYNC_SESSION_RETRY_WINDOW_DAYS}-day window to retry failed item results has expired`,
) {}
