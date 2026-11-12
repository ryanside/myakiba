import { Failure } from "@/domain/failure";

export class RelatedSectionSameAsSource extends Failure(
  "RelatedSectionSameAsSource",
  "bad_request",
  "Related section must differ from source section",
) {}
