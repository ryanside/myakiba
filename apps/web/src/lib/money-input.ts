import { parseMoneyInputToMinorUnits } from "@myakiba/utils/currency";
import * as z from "zod";

export const MONEY_INPUT_HINT = "Enter an amount like 1,234.50";

/** Field validator for an amount `parseMoneyInputToMinorUnits` reads. Empty input reads as 0. */
export const moneyInput = z
  .string()
  .refine((text) => parseMoneyInputToMinorUnits(text).isOk(), MONEY_INPUT_HINT);

/** Minor units of an amount its field's `moneyInput` validator already accepted. */
export function acceptedMoneyToMinorUnits(text: string): number {
  return parseMoneyInputToMinorUnits(text).unwrap(
    `a submitted money field holds ${JSON.stringify(text)}, which its moneyInput validator rejects`,
  );
}
