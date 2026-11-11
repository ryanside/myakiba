import * as z from "zod";

type DateOnlyParts = Readonly<{
  year: number;
  month: number;
  day: number;
}>;

type DateOnlyRange = Readonly<{
  start: string;
  end: string;
}>;

const DATE_ONLY_SCHEMA = z.iso.date().transform((value): DateOnlyParts => {
  const [year = 0, month = 0, day = 0] = value.split("-").map(Number);
  return { year, month, day };
});
const YEAR_ONLY_PATTERN = /^\d{4}$/;
const MONTH_YEAR_PATTERN = /^(\d{1,2})\/(\d{4})$/;
const MONTH_DAY_YEAR_PATTERN = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

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
  const result = DATE_ONLY_SCHEMA.safeParse(datePart);
  return result.success ? result.data : null;
}

function getValidDateOnlyParts(value: string | Date): DateOnlyParts | null {
  const parts = extractDateOnlyParts(value);
  if (!parts) return null;
  const isoDate = `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  return DATE_ONLY_SCHEMA.safeParse(isoDate).success ? parts : null;
}

/**
 * Converts a Date object (from Eden's auto-parsing) back to YYYY-MM-DD string.
 * Eden Treaty automatically converts ISO-compatible strings to Date objects,
 * so we normalize them back to a date-only string before storing or validating.
 */
export function toDateOnlyString(value: Date | string | null | undefined): string | null {
  if (!value) return null;

  if (value instanceof Date) {
    const parts = extractDateOnlyParts(value);
    return parts
      ? `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`
      : null;
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  const datePart = trimmed.split("T")[0] ?? trimmed;
  const result = DATE_ONLY_SCHEMA.safeParse(datePart);
  return result.success
    ? `${String(result.data.year).padStart(4, "0")}-${String(result.data.month).padStart(2, "0")}-${String(result.data.day).padStart(2, "0")}`
    : datePart;
}

/** Returns inclusive YYYY-MM-DD bounds for a calendar month. */
export function getDateOnlyMonthBounds(year: number, month: number): DateOnlyRange {
  const end = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return {
    start: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`,
    end: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(end).padStart(2, "0")}`,
  };
}

/**
 * Normalizes release dates as MFC prints them to YYYY-MM-DD.
 *
 * @example
 * normalizeMfcDate("2006")
 * // "2006-01-01"
 *
 * @example
 * normalizeMfcDate("09/2010")
 * // "2010-09-01"
 *
 * @example
 * normalizeMfcDate("09/18/2025")
 * // "2025-09-18"
 */
export function normalizeMfcDate(dateStr: string): string | null {
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  if (YEAR_ONLY_PATTERN.test(trimmed)) return mfcDate(Number(trimmed), 1, 1);

  const monthYearMatch = trimmed.match(MONTH_YEAR_PATTERN);
  if (monthYearMatch) return mfcDate(Number(monthYearMatch[2]), Number(monthYearMatch[1]), 1);

  const monthDayYearMatch = trimmed.match(MONTH_DAY_YEAR_PATTERN);
  if (monthDayYearMatch) {
    const [, month, day, year] = monthDayYearMatch.map(Number);
    return mfcDate(year ?? 0, month ?? 0, day ?? 0);
  }

  const datePart = trimmed.split("T")[0] ?? trimmed;
  const result = DATE_ONLY_SCHEMA.safeParse(datePart);
  return result.success ? mfcDate(result.data.year, result.data.month, result.data.day) : null;
}

/** Postgres has no year 0, and MFC prints no release year before 1000. */
const EARLIEST_MFC_YEAR = 1000;

function mfcDate(year: number, month: number, day: number): string | null {
  if (year < EARLIEST_MFC_YEAR) return null;
  const isoDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return DATE_ONLY_SCHEMA.safeParse(isoDate).success ? isoDate : null;
}

/**
 * Parses a date-only value into a local-midnight Date for date-picker components.
 */
export function parseDateOnly(value: string | Date | null | undefined): Date | undefined {
  if (!value) return undefined;

  const parts = getValidDateOnlyParts(value);
  if (!parts) return undefined;

  return new Date(parts.year, parts.month - 1, parts.day);
}
