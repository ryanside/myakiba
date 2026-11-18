import { Failure } from "@/domain/failure";

export class StatusNeedsOrder extends Failure(
  "StatusNeedsOrder",
  "conflict",
  "Only an Order Item can be Ordered or Shipped",
) {}
