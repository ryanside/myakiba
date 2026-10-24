import { tagged } from "@/domain/tagged";

/** A dependency /health pings did not answer, or answered with an error. */
export class DependencyUnavailable extends tagged("DependencyUnavailable")<{
  readonly dependency: string;
  readonly reason: string;
  readonly message: string;
}> {
  constructor(args: { readonly dependency: string; readonly reason: string }) {
    super({
      ...args,
      message: `${args.dependency} did not answer its readiness ping: ${args.reason}`,
    });
  }
}
