import { tagged } from "./tagged";

/** Redis did not answer a resync cooldown read or write, so no cooldown can be confirmed. */
export class ResyncCooldownUnavailable extends tagged("ResyncCooldownUnavailable")<{
  readonly itemId: string;
  readonly cause: unknown;
  readonly message: string;
}> {
  constructor(args: { readonly itemId: string; readonly cause: unknown }) {
    super({
      ...args,
      message: `Redis did not answer for the resync cooldown of item ${args.itemId}, so no cooldown can be confirmed. Inspect the attached cause.`,
    });
  }
}
