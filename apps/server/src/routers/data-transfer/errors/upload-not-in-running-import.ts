import { Failure } from "@/domain/failure";

export class UploadNotInRunningImport extends Failure(
  "UploadNotInRunningImport",
  "conflict",
  "This upload does not belong to a running import.",
) {}
