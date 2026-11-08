import { tagged } from "./tagged";

export class MfcQueueHalted extends tagged("MfcQueueHalted")<{
  until: number;
  message: string;
}> {
  constructor(args: { until: number }) {
    super({
      ...args,
      message: `MFC rate-limited the queue in a row or for long, so it halted until ${new Date(args.until).toISOString()}. Every queued item fails with rate_limited. Refresh the item again after that time.`,
    });
  }
}
