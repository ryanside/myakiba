import { Failure } from "@/domain/failure";

export class ItemEntryNotFound extends Failure(
  "ItemEntryNotFound",
  "not_found",
  "Item Entry not found",
) {}
