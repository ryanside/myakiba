import { tagged } from "./tagged";

export class AttemptAbandoned extends tagged("AttemptAbandoned")<{ message: string }> {
  constructor() {
    super({
      message:
        "No run waits for the item any more, so its attempt stopped. Nothing is answered for it.",
    });
  }
}
