import { tagged } from "./tagged";

export class RunClosed extends tagged("RunClosed")<{ status: number | null; message: string }> {
  /** `status` is the 401, 403 or 404 the server answered, or null when a heartbeat said the run had ended. */
  constructor(args: { status: number | null }) {
    const answer = args.status === null ? "said the run had ended" : `answered ${args.status}`;
    super({
      ...args,
      message: `The server ${answer}, so the extension run stops and leaves its end to the server.`,
    });
  }
}
