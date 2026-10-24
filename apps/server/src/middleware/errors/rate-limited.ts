import { Failure } from "@/domain/failure";

export class RateLimited extends Failure(
  "RateLimited",
  "too_many_requests",
  ({ retryAfterSeconds }: { readonly retryAfterSeconds: number }) =>
    `Rate limit exceeded, try again in ${retryAfterSeconds} seconds`,
) {}
