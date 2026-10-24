import { tagged } from "@/domain/tagged";

/**
 * The Order a run imports into is gone, so its item cannot be written. `retryable` when a
 * concurrent delete may have raced the Order lock, so a fresh attempt can see it settle.
 */
export class SyncOrderAbsent extends tagged("SyncOrderAbsent")<{
  readonly retryable: boolean;
  readonly message: string;
}> {
  constructor(args: { readonly retryable: boolean }) {
    super({
      ...args,
      message:
        "The sync run's Order no longer exists, so the item was not imported. The run records the item as a persistence failure.",
    });
  }
}
