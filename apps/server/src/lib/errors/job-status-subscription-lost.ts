import { tagged } from "@/domain/tagged";

const LOST = {
  closed: "Job status subscriber connection closed",
  invalid_payload: "Received invalid job status payload from Redis",
} as const;

/** A job-status stream stopped hearing from Redis. The stream answers connection_lost. */
export class JobStatusSubscriptionLost extends tagged("JobStatusSubscriptionLost")<{
  readonly reason: keyof typeof LOST | "redis_error";
  readonly message: string;
}> {
  constructor(
    args:
      | { readonly reason: keyof typeof LOST }
      | { readonly reason: "redis_error"; readonly cause: Error },
  ) {
    super({ ...args, message: "cause" in args ? args.cause.message : LOST[args.reason] });
  }
}
