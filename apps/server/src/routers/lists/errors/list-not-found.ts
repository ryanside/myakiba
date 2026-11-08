import { Failure } from "@/domain/failure";

export class ListNotFound extends Failure("ListNotFound", "not_found", "List not found") {}
