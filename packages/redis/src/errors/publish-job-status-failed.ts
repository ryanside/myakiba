import { tagged } from "./tagged";

/** Redis did not take a job status, so subscribers missed it. The database keeps the status. */
export class PublishJobStatusFailed extends tagged("PublishJobStatusFailed")<{
  readonly jobId: string | null;
  readonly cause: unknown;
  readonly message: string;
}> {
  constructor(args: { readonly jobId: string | null; readonly cause: unknown }) {
    super({
      ...args,
      message: `Redis did not store or publish the status of job ${args.jobId ?? "(unread)"}, so open streams missed it until their next poll.`,
    });
  }
}
