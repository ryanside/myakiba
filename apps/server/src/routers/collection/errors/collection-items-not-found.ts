import { Failure } from "@/domain/failure";

export class CollectionItemsNotFound extends Failure(
  "CollectionItemsNotFound",
  "not_found",
  "Collection item(s) not found",
) {}
