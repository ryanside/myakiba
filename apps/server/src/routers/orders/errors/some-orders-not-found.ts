import { Failure } from "@/domain/failure";

export class SomeOrdersNotFound extends Failure(
  "SomeOrdersNotFound",
  "not_found",
  "One or more orders not found",
) {}
