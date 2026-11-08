import { Failure } from "@/domain/failure";

export class ItemsMissing extends Failure(
  "ItemsMissing",
  "not_found",
  "Some items are no longer in the item database",
) {}
