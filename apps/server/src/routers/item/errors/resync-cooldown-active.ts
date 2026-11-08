import { Failure } from "@/domain/failure";

export class ResyncCooldownActive extends Failure(
  "ResyncCooldownActive",
  "too_many_requests",
  "Item details were recently refreshed",
) {}
