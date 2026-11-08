import { tagged } from "./tagged";

export class ExtensionStopped extends tagged("ExtensionStopped")<{ message: string }> {
  constructor() {
    super({
      message:
        "The extension ended the run, or stopped answering, before it answered this item. Nothing was sent for it. Reload the page and run it again.",
    });
  }
}
