import { Failure } from "@/domain/failure";

export class ImportNotFound extends Failure("ImportNotFound", "not_found", "Import not found") {}
