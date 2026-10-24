import { tagged } from "./tagged";

export class SessionStoreUnavailable extends tagged("SessionStoreUnavailable")<{
  readonly operation: "get" | "set" | "delete";
  readonly cause: unknown;
  readonly message: string;
}> {
  constructor(args: { readonly operation: "get" | "set" | "delete"; readonly cause: unknown }) {
    super({ ...args, message: `The auth session store failed during ${args.operation}` });
  }
}
