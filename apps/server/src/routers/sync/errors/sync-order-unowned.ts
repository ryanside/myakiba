import { tagged } from "@/domain/tagged";

/** A row of the stored request names an Order the user no longer owns, so no row was written. */
export class SyncOrderUnowned extends tagged("SyncOrderUnowned")<{
  readonly orderIds: readonly string[];
  readonly message: string;
}> {
  constructor(args: { readonly orderIds: readonly string[] }) {
    super({
      ...args,
      message: `The sync rows name Orders ${args.orderIds.join(", ")} that the user does not own, so the transaction wrote none of them.`,
    });
  }
}
