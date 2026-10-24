import type { z } from "zod";
import { tagged } from "./tagged";

export class JsonSchemaMismatch extends tagged("JsonSchemaMismatch")<{
  issues: z.ZodError["issues"];
  cause: z.ZodError;
  message: string;
}> {
  constructor(args: { cause: z.ZodError }) {
    const paths = args.cause.issues.map((issue) => issue.path.map(String).join(".") || "(root)");
    super({
      issues: args.cause.issues,
      cause: args.cause,
      message: `The JSON parsed but failed its schema at ${paths.join(", ")}, so no value was returned. Check what produced the JSON against the schema.`,
    });
  }
}
