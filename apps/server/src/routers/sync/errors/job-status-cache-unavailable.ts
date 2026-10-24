import { tagged } from "@/domain/tagged";

/** Redis did not answer the read of a job's cached status, so the status was not read. */
export class JobStatusCacheUnavailable extends tagged("JobStatusCacheUnavailable")<{
  readonly jobId: string;
  readonly cause: unknown;
  readonly message: string;
}> {
  constructor(args: { readonly jobId: string; readonly cause: unknown }) {
    super({
      ...args,
      message: `Redis did not answer for the cached status of job ${args.jobId}, so the status was not read.`,
    });
  }
}
