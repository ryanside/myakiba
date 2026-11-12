import { Failure } from "@/domain/failure";

export class ListOrSelectionNotFound extends Failure(
  "ListOrSelectionNotFound",
  "not_found",
  "List or selection not found",
) {}
