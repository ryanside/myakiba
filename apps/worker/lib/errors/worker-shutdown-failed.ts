import { tagged } from "@myakiba/utils/errors/tagged";

export class WorkerShutdownFailed extends tagged("WorkerShutdownFailed")<{
  stage: "health" | "consumers" | "flush";
  cause: unknown;
  message: string;
}> {
  constructor(args: { stage: "health" | "consumers" | "flush"; cause: unknown }) {
    super({
      ...args,
      message: `The ${args.stage} shutdown stage failed or timed out. The process exits with code 1. Inspect the attached cause.`,
    });
  }
}
