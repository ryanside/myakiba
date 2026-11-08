import { tagged } from "./tagged";

export class SendAuthEmailFailed extends tagged("SendAuthEmailFailed")<{
  purpose: "verification" | "reset";
  cause: unknown;
  message: string;
}> {
  constructor(args: { purpose: "verification" | "reset"; cause: unknown }) {
    super({
      ...args,
      message: `Sending the ${args.purpose} email failed. Inspect the provider cause and retry the request.`,
    });
  }
}
