import { Failure } from "@/domain/failure";

export class EntryNotFound extends Failure("EntryNotFound", "not_found", "Entry not found") {}
