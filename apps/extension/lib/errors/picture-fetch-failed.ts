import type { ErrorSummary } from "./summary";
import { tagged } from "./tagged";

export class PictureFetchFailed extends tagged("PictureFetchFailed")<{
  cause: ErrorSummary;
  message: string;
}> {
  constructor(args: { cause: ErrorSummary }) {
    super({
      ...args,
      message: `The collector's fetch of the picture failed with ${args.cause.name}: ${args.cause.message}. The item refreshes without its picture. Check the network and MFC's availability.`,
    });
  }
}
