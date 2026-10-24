import { Result } from "better-result";
import type { z } from "zod";
import { InvalidJson } from "./errors/invalid-json";
import { JsonSchemaMismatch } from "./errors/json-schema-mismatch";

export function parseJson<T>(
  schema: z.ZodType<T>,
  text: string,
): Result<T, InvalidJson | JsonSchemaMismatch> {
  return Result.try({
    try: () => JSON.parse(text),
    catch: () => new InvalidJson(),
  }).andThen((value): Result<T, JsonSchemaMismatch> => {
    const parsed = schema.safeParse(value);
    return parsed.success
      ? Result.ok(parsed.data)
      : Result.err(new JsonSchemaMismatch({ cause: parsed.error }));
  });
}
