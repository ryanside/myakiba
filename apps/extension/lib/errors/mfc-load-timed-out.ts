import { tagged } from "./tagged";

export class MfcLoadTimedOut extends tagged("MfcLoadTimedOut")<{
  timeoutMs: number;
  message: string;
}> {
  constructor(args: { timeoutMs: number }) {
    super({
      ...args,
      message: `An MFC load did not finish within its ${args.timeoutMs} ms turn. The throttle still books the load until it ends. Check MFC's latency.`,
    });
  }
}
