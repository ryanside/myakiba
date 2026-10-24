import { tagged } from "./tagged";

/**
 * A write failed and its command already handled it: the optimistic patch is rolled back, the
 * failure toast is shown and the failure refetch has run. This is the write's supervision
 * boundary, so a caller only decides what it does next, such as keeping a form open. `cause` is
 * the write's declared failure or a Panic, and `message` is the cause's.
 */
export class WriteFailed extends tagged("WriteFailed")<{
  readonly cause: Error;
  readonly message: string;
}> {}
