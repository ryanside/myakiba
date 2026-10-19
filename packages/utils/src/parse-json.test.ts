import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { parseJson } from "./parse-json";

const statusSchema = z.object({ status: z.enum(["pending", "done"]) });

describe("parseJson", () => {
  test("returns the parsed value when the text matches the schema", () => {
    expect(parseJson(statusSchema, '{"status":"done"}')).toEqual({
      data: { status: "done" },
      error: null,
    });
  });

  test("returns a SyntaxError for text that is not JSON", () => {
    const { data, error } = parseJson(statusSchema, "{status:");
    expect(data).toBeNull();
    expect(error).toBeInstanceOf(SyntaxError);
  });

  test("returns the zod error for JSON that does not match the schema", () => {
    const { data, error } = parseJson(statusSchema, '{"status":"lost"}');
    expect(data).toBeNull();
    expect(error).toBeInstanceOf(z.ZodError);
  });
});
