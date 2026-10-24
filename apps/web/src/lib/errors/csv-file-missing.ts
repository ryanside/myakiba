import { tagged } from "./tagged";

/** The CSV import was submitted without a file. */
export class CsvFileMissing extends tagged("CsvFileMissing")<{
  readonly message: string;
}> {
  constructor() {
    super({ message: "No file selected" });
  }
}
