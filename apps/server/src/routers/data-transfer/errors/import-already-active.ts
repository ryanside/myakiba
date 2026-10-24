import { Failure } from "@/domain/failure";

export class ImportAlreadyActive extends Failure(
  "ImportAlreadyActive",
  "conflict",
  "Another data import is already active.",
) {}
