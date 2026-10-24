import { Failure } from "@/domain/failure";

export class ActiveImportNotDeletable extends Failure(
  "ActiveImportNotDeletable",
  "conflict",
  "An active import cannot be deleted.",
) {}
