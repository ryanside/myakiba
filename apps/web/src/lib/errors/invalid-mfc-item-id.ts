import { tagged } from "./tagged";

export class InvalidMfcItemId extends tagged("InvalidMfcItemId")<{
  externalId: number;
  message: string;
}> {
  constructor(args: { externalId: number }) {
    super({
      ...args,
      message: `${args.externalId} is not an MFC item id, so the extension was not asked to refresh it.`,
    });
  }
}
