import { tagged } from "./tagged";

/** The live import status stream dropped or could not reach the server. The read reconnects. */
export class ImportStatusStreamDisconnected extends tagged("ImportStatusStreamDisconnected")<{
  readonly cause?: unknown;
  readonly message: string;
}> {}
