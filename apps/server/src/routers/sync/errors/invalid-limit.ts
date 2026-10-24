import { Failure } from "@/domain/failure";

export class InvalidLimit extends Failure(
  "InvalidLimit",
  "bad_request",
  "Invalid limit parameter",
) {}
