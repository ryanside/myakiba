import { Failure } from "@/domain/failure";

export class ExportArchiveEmpty extends Failure(
  "ExportArchiveEmpty",
  "conflict",
  "There is no data to export.",
) {}
