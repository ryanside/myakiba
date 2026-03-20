import { format as formatDateFns, isValid, parse } from "date-fns";

type DateOnlyParts = Readonly<{
  year: number;
  month: number;
  day: number;
}>;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const YEAR_ONLY_PATTERN = /^\d{4}$/;
const MONTH_YEAR_PATTERN = /^(\d{1,2})\/(\d{4})$/;

function padNumber(value: number): string {
  return String(value).padStart(2, "0");
}

function partsToIsoDate({ year, month, day }: DateOnlyParts): string {
  return `${String(year).padStart(4, "0")}-${padNumber(month)}-${padNumber(day)}`;
}

function isValidDateOnlyParts(parts: DateOnlyParts): boolean {
  const date = new Date(parts.year, parts.month - 1, parts.day);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === parts.year &&
    date.getMonth() === parts.month - 1 &&
    date.getDate() === parts.day
  );
}

function parseIsoDateParts(value: string): DateOnlyParts | null {
  if (!DATE_ONLY_PATTERN.test(value)) return null;

  const parsedDate = parse(value, "yyyy-MM-dd", new Date());
  if (!isValid(parsedDate)) return null;
  if (formatDateFns(parsedDate, "yyyy-MM-dd") !== value) return null;

  return {
    year: parsedDate.getFullYear(),
    month: parsedDate.getMonth() + 1,
    day: parsedDate.getDate(),
  };
}

function extractDateOnlyParts(value: string | Date): DateOnlyParts | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;

    return {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate(),
    };
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  const datePart = trimmed.split("T")[0] ?? "";
  return parseIsoDateParts(datePart);
}

function toLocalDate(parts: DateOnlyParts): Date {
  return new Date(parts.year, parts.month - 1, parts.day);
}

function getValidDateOnlyParts(value: string | Date): DateOnlyParts | null {
  const parts = extractDateOnlyParts(value);
  if (!parts) return null;
  return isValidDateOnlyParts(parts) ? parts : null;
}

/**
 * Converts a Date object (from Eden's auto-parsing) back to YYYY-MM-DD string.
 * Eden Treaty automatically converts ISO-compatible strings to Date objects,
 * so we normalize them back to a date-only string before storing or validating.
 *
 * @example
 * toDateOnlyString("2024-03-15T00:00:00.000Z")
 * // "2024-03-15"
 *
 * @example
 * toDateOnlyString(new Date("2024-03-15T00:00:00.000Z"))
 * // "2024-03-15"
 *
 * @example
 * toDateOnlyString(null)
 * // null
 */
export function toDateOnlyString(value: Date | string | null | undefined): string | null {
  if (!value) return null;

  if (value instanceof Date) {
    const parts = extractDateOnlyParts(value);
    return parts ? partsToIsoDate(parts) : null;
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  const datePart = trimmed.split("T")[0] ?? trimmed;
  const parts = parseIsoDateParts(datePart);
  return parts ? partsToIsoDate(parts) : datePart;
}

/**
 * Normalizes supported scraped release-date inputs to YYYY-MM-DD.
 * Returns null for unsupported or invalid formats so callers can decide how to handle them.
 *
 * @example
 * normalizeScrapedDate("2006")
 * // "2006-01-01"
 *
 * @example
 * normalizeScrapedDate("09/2010")
 * // "2010-09-01"
 *
 * @example
 * normalizeScrapedDate("2024-01-15")
 * // "2024-01-15"
 *
 * @example
 * normalizeScrapedDate("TBD")
 * // null
 */
export function normalizeScrapedDate(dateStr: string): string | null {
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  if (YEAR_ONLY_PATTERN.test(trimmed)) {
    return `${trimmed}-01-01`;
  }

  const monthYearMatch = trimmed.match(MONTH_YEAR_PATTERN);
  if (monthYearMatch) {
    const month = Number(monthYearMatch[1]);
    const year = Number(monthYearMatch[2]);
    const parts: DateOnlyParts = { year, month, day: 1 };
    return isValidDateOnlyParts(parts) ? partsToIsoDate(parts) : null;
  }

  const datePart = trimmed.split("T")[0] ?? trimmed;
  const parts = parseIsoDateParts(datePart);
  return parts ? partsToIsoDate(parts) : null;
}

/**
 * Parses a date-only value into a local-midnight Date for date-picker components.
 *
 * @example
 * const date = parseDateOnly("2024-03-15");
 * date?.getFullYear()
 * // 2024
 *
 * @example
 * const date = parseDateOnly("2024-03-15");
 * date?.getMonth()
 * // 2
 *
 * @example
 * const date = parseDateOnly("2024-03-15");
 * date?.getDate()
 * // 15
 *
 * @example
 * parseDateOnly("not-a-date")
 * // undefined
 */
export function parseDateOnly(value: string | Date | null | undefined): Date | undefined {
  if (!value) return undefined;

  const parts = getValidDateOnlyParts(value);
  if (!parts) return undefined;

  return toLocalDate(parts);
}
