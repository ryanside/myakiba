import { tagged } from "./tagged";

/** An MFC CSV with no Owned or Ordered rows, so there is nothing to import. */
export class CsvNoImportableItems extends tagged("CsvNoImportableItems")<{
  readonly message: string;
}> {
  constructor() {
    super({ message: "This CSV has no supported Owned or Ordered items to import" });
  }
}
