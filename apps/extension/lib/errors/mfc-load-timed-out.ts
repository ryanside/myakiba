import { tagged } from "./tagged";

export class MfcLoadTimedOut extends tagged("MfcLoadTimedOut")<{
  timeoutMs: number;
  phase: "page" | "tab";
  message: string;
}> {
  constructor(args: { timeoutMs: number; phase: "page" | "tab" }) {
    const what = args.phase === "page" ? "The item page" : "The MFC tab's load";
    super({
      ...args,
      message: `${what} did not finish within ${args.timeoutMs} ms. The throttle still books the load until it ends. Check MFC's latency.`,
    });
  }
}
