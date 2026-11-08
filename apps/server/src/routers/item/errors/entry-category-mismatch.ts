import { Failure } from "@/domain/failure";

export class EntryCategoryMismatch extends Failure(
  "EntryCategoryMismatch",
  "bad_request",
  "Entry category mismatch",
) {}
