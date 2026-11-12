import { tagged } from "./tagged";

/** The cache no longer holds the order a drag was computed from, so the move is not sent. */
export class StalePositionOrder extends tagged("StalePositionOrder")<{
  readonly message: string;
}> {}
