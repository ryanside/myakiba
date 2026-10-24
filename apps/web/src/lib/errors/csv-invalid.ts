import { tagged } from "./tagged";

/** The CSV's rows do not match an MFC CSV export. `cause` is the schema's error. */
export class CsvInvalid extends tagged("CsvInvalid")<{
  readonly cause: unknown;
  readonly message: string;
}> {
  constructor({ cause }: { readonly cause: unknown }) {
    super({ cause, message: "Please select a valid MyFigureCollection CSV file" });
  }
}
