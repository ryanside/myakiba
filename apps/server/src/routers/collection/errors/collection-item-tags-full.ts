import { Failure } from "@/domain/failure";

export class CollectionItemTagsFull extends Failure(
  "CollectionItemTagsFull",
  "conflict",
  "A Collection Item can hold at most 100 tags",
) {}
