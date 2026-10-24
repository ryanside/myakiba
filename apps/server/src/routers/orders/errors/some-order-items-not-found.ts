import { Failure } from "@/domain/failure";

export class SomeOrderItemsNotFound extends Failure(
  "SomeOrderItemsNotFound",
  "not_found",
  "One or more order items not found",
) {}
