import { Failure } from "@/domain/failure";

export class OrderNotFound extends Failure("OrderNotFound", "not_found", "Order not found") {}
