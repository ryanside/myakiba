import { Failure } from "@/domain/failure";

export class InactiveImportNotFound extends Failure(
  "InactiveImportNotFound",
  "not_found",
  "No inactive import session was found.",
) {}
