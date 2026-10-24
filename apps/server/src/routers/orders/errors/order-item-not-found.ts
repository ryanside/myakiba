import { Failure } from "@/domain/failure";

export class OrderItemNotFound extends Failure(
  "OrderItemNotFound",
  "not_found",
  "Order item not found",
) {}
