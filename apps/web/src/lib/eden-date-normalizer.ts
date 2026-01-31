import { dateToString } from "@myakiba/utils";

type NormalizablePrimitive = string | number | boolean | null | undefined;

export type EdenDateNormalizable =
  | NormalizablePrimitive
  | Date
  | EdenDateNormalizableObject
  | EdenDateNormalizableArray;

export type EdenDateNormalizableObject = {
  readonly [key: string]: EdenDateNormalizable;
};

export type EdenDateNormalizableArray = ReadonlyArray<EdenDateNormalizable>;

const DATE_ONLY_KEYS = new Set<string>([
  "orderDate",
  "paymentDate",
  "shippingDate",
  "collectionDate",
  "releaseDate",
  "date",
  "order_date",
  "payment_date",
  "shipping_date",
  "collecting_date",
  "release_date",
  "release_month_year",
  "releaseMonthYear",
]);

const isPlainObject = (value: EdenDateNormalizable): value is EdenDateNormalizableObject => {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  if (value instanceof Date) return false;
  return Object.prototype.toString.call(value) === "[object Object]";
};

const normalizeDateValue = (value: EdenDateNormalizable): EdenDateNormalizable => {
  if (value === undefined) return value;
  if (value === null || value instanceof Date || typeof value === "string") {
    return dateToString(value);
  }
  return value;
};

export const normalizeEdenDateFields = (value: EdenDateNormalizable): EdenDateNormalizable => {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeEdenDateFields(entry));
  }

  if (isPlainObject(value)) {
    const normalizedEntries = Object.entries(value).map(([key, entryValue]) => {
      const normalizedValue = DATE_ONLY_KEYS.has(key)
        ? normalizeDateValue(entryValue)
        : normalizeEdenDateFields(entryValue);
      return [key, normalizedValue] as const;
    });

    return Object.fromEntries(normalizedEntries);
  }

  return value;
};
