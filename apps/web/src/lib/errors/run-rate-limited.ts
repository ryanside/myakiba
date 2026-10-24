import { tagged } from "./tagged";

export class RunRateLimited extends tagged("RunRateLimited")<{
  retryAfterMs: number | null;
  message: string;
}> {
  constructor(args: { retryAfterMs: number | null }) {
    const wait = args.retryAfterMs === null ? "with no Retry-After" : `for ${args.retryAfterMs} ms`;
    super({
      ...args,
      message: `The server rate-limited the extension run ${wait}. A short wait is retried once, and a long one stops the run.`,
    });
  }
}
