import { tagged } from "./tagged";

export class PictureTimedOut extends tagged("PictureTimedOut")<{
  timeoutMs: number;
  message: string;
}> {
  constructor(args: { timeoutMs: number }) {
    super({
      ...args,
      message: `The picture did not arrive within ${args.timeoutMs} ms, so the collector stopped its fetch. The item imports without its picture. Check MFC's latency.`,
    });
  }
}
