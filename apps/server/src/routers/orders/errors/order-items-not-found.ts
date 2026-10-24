import { Failure } from "@/domain/failure";

export class OrderItemsNotFound extends Failure(
  "OrderItemsNotFound",
  "not_found",
  "Order items not found",
) {}
