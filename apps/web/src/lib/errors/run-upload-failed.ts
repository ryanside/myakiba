import { tagged } from "./tagged";

export class RunUploadFailed extends tagged("RunUploadFailed")<{
  status: number | null;
  cause: unknown;
  message: string;
}> {
  /** `status` is the server's refusal, or null when the answer broke off or said the item was not saved. */
  constructor(args: { status: number | null; cause?: unknown }) {
    const answer = args.status === null ? "no usable answer" : `status ${args.status}`;
    super({
      ...args,
      cause: args.cause,
      message: `A request of the extension run got ${answer} from the server. The items it carried count as not imported, and the run goes on.`,
    });
  }
}
