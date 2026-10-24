import type { ItemFetchErrorCode } from "@myakiba/contracts/sync/constants";
import { tagged } from "./tagged";

export class MfcItemFetchFailed extends tagged("MfcItemFetchFailed")<{
  code: ItemFetchErrorCode | "unknown";
  message: string;
}> {
  constructor(args: { code: ItemFetchErrorCode | "unknown" }) {
    super({
      ...args,
      message: `The extension could not fetch the item from MyFigureCollection and answered ${args.code}. The item is reported failed with that code.`,
    });
  }
}
