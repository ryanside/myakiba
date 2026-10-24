import { tagged } from "./tagged";

export class JobStatusPayloadInvalid extends tagged("JobStatusPayloadInvalid")<{
  readonly cause: unknown;
  readonly message: string;
}> {
  constructor(cause: unknown) {
    super({ cause, message: "The Redis job status payload is not a valid status snapshot" });
  }
}
