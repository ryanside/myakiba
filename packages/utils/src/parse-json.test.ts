import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { parseJson } from "./parse-json";

const statusSchema = z.object({ status: z.enum(["pending", "done"]) });

describe("parseJson", () => {
  test("returns the parsed value when the text matches the schema", () => {
    const result = parseJson(statusSchema, '{"status":"done"}');

    expect(result.isOk() && result.value).toEqual({ status: "done" });
  });

  test("a throwing schema propagates its original defect", () => {
    const original = new Error("broken schema transform");
    const schema = z.string().transform(() => {
      throw original;
    });
    expect(() => parseJson(schema, '"value"')).toThrow(original);
  });

  test("returns InvalidJson for text that is not JSON, without the text", () => {
    const result = parseJson(statusSchema, '{"status":"s3cret');

    expect(result.isErr() && result.error._tag).toBe("InvalidJson");
    expect(JSON.stringify(result)).not.toContain("s3cret");
  });

  test("returns JsonSchemaMismatch with the zod issues for JSON that does not match the schema", () => {
    const result = parseJson(statusSchema, '{"status":"s3cret"}');
    if (!result.isErr() || result.error._tag !== "JsonSchemaMismatch") {
      throw new Error("expected JsonSchemaMismatch");
    }

    expect(result.error.cause).toBeInstanceOf(z.ZodError);
    expect(result.error.issues.map((issue) => issue.path)).toEqual([["status"]]);
    expect(result.error.message).toContain("at status");
    expect(JSON.stringify(result)).not.toContain("s3cret");
  });
});
