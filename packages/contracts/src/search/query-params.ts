import * as z from "zod";

type NonEmptyStringTuple = readonly [string, ...string[]];

export const commaSeparatedStringArraySchema = z.preprocess((value) => {
  if (Array.isArray(value)) {
    return value;
  }
  const stringValue = z.string().min(1).safeParse(value);
  if (stringValue.success) {
    return stringValue.data
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
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
      return stringValue.data
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
    }
  }, z.array(z.enum(values)).optional());
}
