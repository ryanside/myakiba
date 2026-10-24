import type { z } from "zod";
import { tagged } from "./tagged";

/** The chosen export is JSON but not a myakiba export this version reads. Its message is the schema's first issue. */
export class ExportFileUnsupported extends tagged("ExportFileUnsupported")<{
  readonly cause: z.ZodError;
  readonly message: string;
}> {
  constructor({ cause }: { readonly cause: z.ZodError }) {
    super({
      cause,
      message: cause.issues[0]?.message ?? "This is not a supported myakiba export.",
    });
  }
}
