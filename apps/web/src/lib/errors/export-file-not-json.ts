import { tagged } from "./tagged";

/** The chosen export does not parse as JSON. */
export class ExportFileNotJson extends tagged("ExportFileNotJson")<{
  readonly message: string;
}> {
  constructor() {
    super({ message: "This file is not valid JSON." });
  }
}
