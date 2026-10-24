import { Failure } from "@/domain/failure";

export class ItemNotInImport extends Failure(
  "ItemNotInImport",
  "not_found",
  "This item is not part of the import",
) {}
