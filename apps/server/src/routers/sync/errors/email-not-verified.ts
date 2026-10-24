import { SYNC_STATUS_MESSAGES } from "@myakiba/contracts/sync/messages";
import { Failure } from "@/domain/failure";

export class EmailNotVerified extends Failure(
  "EmailNotVerified",
  "forbidden",
  SYNC_STATUS_MESSAGES.requireEmailVerification,
) {}
