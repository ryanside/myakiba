import { describe, expect, test } from "bun:test";
import { Result } from "better-result";
import * as currency from "./currency";

// Replay the same input assertions against the legacy parser before the strict API existed.
const parse = (input: string) =>
  "parseMoneyInputToMinorUnits" in currency
    ? currency.parseMoneyInputToMinorUnits(input)
    : Result.ok(currency.parseMoneyToMinorUnits(input));

describe("strict money input", () => {
  test.each([
    ["", 0],
    ["  ", 0],
    ["0", 0],
    ["  12.50 \n", 1250],
    ["1234", 123400],
    ["1,234.5", 123450],
    ["1,234,567", 123456700],
    ["12.01", 1201],
    ["0001.05", 105],
    ["90,071,992,547,409.91", 9007199254740991],
  ] as const)("accepts %j as %i minor units", (input, expected) => {
    expect(parse(input)).toMatchObject({ status: "ok", value: expected });
  });

  test.each([
    ["12,50", "format"],
    ["1.2.3", "format"],
    ["1-2", "format"],
    ["-5", "negative"],
    ["-0", "negative"],
    ["1,234.567", "precision"],
    ["abc", "format"],
    ["12,34", "format"],
    ["1234,567", "format"],
    ["1,,234", "format"],
    ["1,234,56", "format"],
    ["$12", "format"],
    ["+5", "format"],
    ["1 234", "format"],
    ["1e3", "format"],
    [".50", "format"],
    ["12.", "format"],
    ["1.234", "precision"],
    ["90071992547409.92", "unsafe_integer"],
    ["9".repeat(400), "unsafe_integer"],
  ] as const)("rejects %j for %s", (input, rule) => {
    expect(parse(input)).toMatchObject({
      status: "error",
      error: { _tag: "MoneyInputInvalid", input, rule },
    });
  });
});
