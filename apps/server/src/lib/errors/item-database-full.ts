import { Failure } from "@/domain/failure";

export class ItemDatabaseFull extends Failure(
  "ItemDatabaseFull",
  "conflict",
  "Your Item Database is full. One account can hold 20,000 Items.",
) {}
