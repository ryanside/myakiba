import { Failure } from "@/domain/failure";

export class CollectionItemNotFound extends Failure(
  "CollectionItemNotFound",
  "not_found",
  "Collection item not found",
) {}
