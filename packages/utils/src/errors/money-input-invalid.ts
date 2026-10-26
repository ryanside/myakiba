import { tagged } from "./tagged";

export class MoneyInputInvalid extends tagged("MoneyInputInvalid")<{
  readonly input: string;
  readonly rule: "format" | "negative" | "precision" | "unsafe_integer";
  readonly message: string;
}> {
  constructor(input: string, rule: MoneyInputInvalid["rule"]) {
    super({ input, rule, message: `Invalid money input (${rule}): ${JSON.stringify(input)}` });
  }
}
