import { tagged } from "@myakiba/utils/errors/tagged";

export class SyncHistoryCleanupFailed extends tagged("SyncHistoryCleanupFailed")<{
  cutoff: Date;
  cause: unknown;
  message: string;
}> {
  constructor(args: { cutoff: Date; cause: unknown }) {
    super({
      ...args,
      message: `Deleting the sync history created before ${args.cutoff.toISOString()} failed, so none of it was deleted. BullMQ records the failed job and the next scheduled run tries again. Check the database and the attached cause.`,
    });
  }
}
