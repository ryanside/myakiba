import { Failure } from "@/domain/failure";

export class ItemNotFound extends Failure("ItemNotFound", "not_found", "Item not found") {}
