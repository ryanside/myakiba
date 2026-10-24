import { tagged } from "./tagged";

/**
 * The extension run refused or could not finish an Item Refresh. Its message is the run's own
 * text, such as the item's cooldown.
 */
export class ItemRefreshFailed extends tagged("ItemRefreshFailed")<{
  readonly cause: unknown;
  readonly message: string;
}> {}
