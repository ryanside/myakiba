import { Failure } from "@/domain/failure";

export class SelectionNotFound extends Failure(
  "SelectionNotFound",
  "not_found",
  "Selection not found",
) {}
