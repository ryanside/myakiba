import { tagged } from "./tagged";

export class InvalidJson extends tagged("InvalidJson")<{ message: string }> {
  constructor() {
    super({
      message:
        "JSON.parse rejected the text, so it was not checked against the schema. The SyntaxError is not kept because engines quote the text in its message. Check what produced the text.",
    });
  }
}
