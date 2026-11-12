import { tagged } from "./tagged";

/** The target Order or the moved Collection Items no longer exist. Its message is the server's 404 text. */
export class MoveTargetGone extends tagged("MoveTargetGone")<{
  readonly message: string;
}> {}
