import { tagged } from "./tagged";

/** The chosen export is over the import limit, so it is not read. */
export class ExportFileTooLarge extends tagged("ExportFileTooLarge")<{
  readonly message: string;
}> {
  constructor() {
    super({ message: "The selected export is larger than the 50 MiB import limit." });
  }
}
