import { Failure } from "@/domain/failure";

export class ExportUnsupportedCollectionItem extends Failure(
  "ExportUnsupportedCollectionItem",
  "conflict",
  "Data transfer only supports MyFigureCollection-backed collection items.",
) {}
