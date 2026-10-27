import { Result } from "better-result";
import type { z } from "zod";
import { InvalidJson } from "./errors/invalid-json";
import { JsonSchemaMismatch } from "./errors/json-schema-mismatch";

export function parseJson<T>(
  schema: z.ZodType<T>,
  text: string,
): Result<T, InvalidJson | JsonSchemaMismatch> {
  const decoded = Result.try({
    try: () => JSON.parse(text),
    catch: () => new InvalidJson(),
  });
  if (decoded.isErr()) return decoded;
  const parsed = schema.safeParse(decoded.value);
  return parsed.success
    ? Result.ok(parsed.data)
    : Result.err(new JsonSchemaMismatch({ cause: parsed.error }));
}
