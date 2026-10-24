import { tagged } from "@myakiba/utils/errors/tagged";

export class WorkerShutdownFailed extends tagged("WorkerShutdownFailed")<{
  cause: unknown;
  message: string;
}> {
  constructor(args: { cause: unknown }) {
    super({
      ...args,
      message:
        "Closing the queue consumers failed during shutdown, so a job may have stopped mid-run and the process exits with code 1. Check the attached cause.",
    });
  }
}
