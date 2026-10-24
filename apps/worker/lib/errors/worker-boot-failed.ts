import { tagged } from "@myakiba/utils/errors/tagged";

export class WorkerBootFailed extends tagged("WorkerBootFailed")<{
  cause: unknown;
  message: string;
}> {
  constructor(args: { cause: unknown }) {
    super({
      ...args,
      message:
        "Loading the worker's queues failed, so no queue consumer started and the process exits. Check Redis, the database and the attached cause.",
    });
  }
}
