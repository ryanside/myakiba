import { EMAIL_VERIFICATION_REQUIRED } from "@myakiba/contracts/shared/messages";
import { Failure } from "@/domain/failure";

export class EmailNotVerified extends Failure(
  "EmailNotVerified",
  "forbidden",
  EMAIL_VERIFICATION_REQUIRED,
) {}
