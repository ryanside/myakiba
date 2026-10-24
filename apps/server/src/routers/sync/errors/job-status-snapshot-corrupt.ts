import { tagged } from "@/domain/tagged";
import type { JobStatusPayloadInvalid } from "@myakiba/redis/errors/job-status-payload-invalid";

export class JobStatusSnapshotCorrupt extends tagged("JobStatusSnapshotCorrupt")<{
  readonly jobId: string;
  readonly cause: JobStatusPayloadInvalid;
  readonly message: string;
}> {
  constructor(args: { readonly jobId: string; readonly cause: JobStatusPayloadInvalid }) {
    super({ ...args, message: "Corrupt Redis job status cache; falling back to DB" });
  }
}
