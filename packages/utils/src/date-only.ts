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
 * normalizeScrapedDate("09/18/2025")
 * // "2025-09-18"
 *
 * @example
 * normalizeScrapedDate("TBD")
 * // null
 */
export function normalizeScrapedDate(dateStr: string): string | null {
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  if (YEAR_ONLY_PATTERN.test(trimmed)) {
    const isoDate = `${String(Number(trimmed)).padStart(4, "0")}-01-01`;
    return DATE_ONLY_SCHEMA.safeParse(isoDate).success ? isoDate : null;
  }

  const monthYearMatch = trimmed.match(MONTH_YEAR_PATTERN);
  if (monthYearMatch) {
    const month = Number(monthYearMatch[1]);
    const year = Number(monthYearMatch[2]);
    const isoDate = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
    return DATE_ONLY_SCHEMA.safeParse(isoDate).success ? isoDate : null;
  }

  const monthDayYearMatch = trimmed.match(MONTH_DAY_YEAR_PATTERN);
  if (monthDayYearMatch) {
    const month = Number(monthDayYearMatch[1]);
    const day = Number(monthDayYearMatch[2]);
    const year = Number(monthDayYearMatch[3]);
    const isoDate = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return DATE_ONLY_SCHEMA.safeParse(isoDate).success ? isoDate : null;
  }

  const datePart = trimmed.split("T")[0] ?? trimmed;
  const result = DATE_ONLY_SCHEMA.safeParse(datePart);
  return result.success
    ? `${String(result.data.year).padStart(4, "0")}-${String(result.data.month).padStart(2, "0")}-${String(result.data.day).padStart(2, "0")}`
    : null;
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

  return new Date(parts.year, parts.month - 1, parts.day);
}
