import * as z from "zod";

type NonEmptyStringTuple = readonly [string, ...string[]];

const splitCommaSeparatedValue = (value: string): string[] =>
  value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

export const commaSeparatedStringArraySchema = z.preprocess((value) => {
  if (Array.isArray(value)) {
    return value;
  }
  const stringValue = z.string().min(1).safeParse(value);
  if (stringValue.success) {
    return splitCommaSeparatedValue(stringValue.data);
  }
}, z.array(z.string()).optional());

export function createCommaSeparatedEnumArraySchema<const TValues extends NonEmptyStringTuple>(
  values: TValues,
) {
  return z.preprocess((value) => {
    if (Array.isArray(value)) {
      return value;
    }
    const stringValue = z.string().min(1).safeParse(value);
    if (stringValue.success) {
      return splitCommaSeparatedValue(stringValue.data);
    }
  }, z.array(z.enum(values)).optional());
}
