import { Failure } from "@/domain/failure";

export class ReleaseNotOfItem extends Failure(
  "ReleaseNotOfItem",
  "not_found",
  "A chosen release is not a release of its item",
) {}
