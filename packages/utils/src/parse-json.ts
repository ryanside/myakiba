import type { z } from "zod";
import type { Result } from "./result";

export function parseJson<T>(
  schema: z.ZodType<T>,
  text: string,
): Result<T, SyntaxError | z.ZodError<T>> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { data: null, error: error as SyntaxError };
  }
  const result = schema.safeParse(value);
  return result.success ? { data: result.data, error: null } : { data: null, error: result.error };
}
