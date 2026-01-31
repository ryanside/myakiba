import type { DateFormat } from "@myakiba/types";

/**
 * Converts a Date object (from Eden's auto-parsing) back to YYYY-MM-DD string.
 * Eden Treaty automatically converts any ISO-compatible strings to Date objects,
 * so we need to convert them back for consistent handling.
 * Elysia needs to fix this in order for me to use stricter validation like z.iso.date().
 */
export const dateToString = (value: Date | string | null | undefined): string | null => {
  if (!value) return null;
  if (value instanceof Date) {
    return value.toISOString().split("T")[0] ?? null;
  }
  if (typeof value === "string") {
    return value.split("T")[0] ?? value;
  }
  return null;
};

/**
 * Normalizes various date string formats to YYYY-MM-DD format.
 * Used by the worker to handle MFC date formats during scraping.
 * @param dateStr - Date string in various formats (e.g., "2006", "09/2010", "2024-01-15")
 * @returns Date string in YYYY-MM-DD format, or "Invalid date" if parsing fails
 * @example
 * normalizeDateString("2006")       // "2006-01-01"
 * normalizeDateString("09/2010")    // "2010-09-01"
 * normalizeDateString("2024-01-15") // "2024-01-15"
 */
export const normalizeDateString = (dateStr: string): string => {
  const trimmed = dateStr.trim();

  // Handle year only (e.g., "2006")
  if (/^\d{4}$/.test(trimmed)) {
    return `${trimmed}-01-01`;
  }

  // Handle MM/YYYY format (e.g., "09/2010")
  if (/^\d{1,2}\/\d{4}$/.test(trimmed)) {
    const [month, year] = trimmed.split("/");
    const paddedMonth = month?.padStart(2, "0") ?? "01";
    return `${year}-${paddedMonth}-01`;
  }

  // Handle YYYY-MM-DD format (pass through)
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // Try to parse as a date and extract YYYY-MM-DD
  try {
    const date = new Date(trimmed);
    if (isNaN(date.getTime())) {
      console.error(`Invalid date format: "${dateStr}"`);
      return "Invalid date";
    }
    return date.toISOString().split("T")[0]!;
  } catch {
    console.error(`Invalid date format: "${dateStr}"`);
    return "Invalid date";
  }
};

// ============================================================================
// Internal helpers
// ============================================================================

type DateParts = Readonly<{
  year: number;
  month: number;
  day: number;
}>;

const YEAR_FIRST_FORMATS: readonly DateFormat[] = ["YYYY/MM/DD", "YYYY/DD/MM"];

/**
 * Extracts date parts (year, month, day) from a string or Date object.
 * For strings: parses the date portion directly to avoid timezone issues.
 * For Date objects: extracts parts using UTC methods for ISO dates, local for others.
 *
 * @param value - ISO 8601 string, Date object, or date string
 * @returns DateParts object or null if invalid
 */
const extractDateParts = (value: string | Date): DateParts | null => {
  // Handle Date objects
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    // Use UTC methods since Date objects from ISO strings are in UTC
    return {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate(),
    };
  }

  // Handle strings
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Extract the YYYY-MM-DD part (before any 'T')
  const datePart = trimmed.split("T")[0] ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;

  const [year, month, day] = datePart.split("-").map(Number);
  if (!year || !month || !day) return null;

  return { year, month, day };
};

const isYearFirstFormat = (format: DateFormat): boolean => YEAR_FIRST_FORMATS.includes(format);

/**
 * Formats DateParts according to the user's preferred date format.
 */
const formatPartsToString = (parts: DateParts, format: DateFormat): string => {
  const { year, month, day } = parts;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const yyyy = String(year);

  switch (format) {
    case "MM/DD/YYYY":
      return `${mm}/${dd}/${yyyy}`;
    case "DD/MM/YYYY":
      return `${dd}/${mm}/${yyyy}`;
    case "YYYY/MM/DD":
      return `${yyyy}/${mm}/${dd}`;
    case "YYYY/DD/MM":
      return `${yyyy}/${dd}/${mm}`;
  }
};

const MONTH_NAMES: readonly string[] = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// ============================================================================
// Public date formatting functions
// ============================================================================

/**
 * Formats a date according to the user's preferred format.
 * For strings: parses the date portion directly to avoid timezone issues.
 *
 * @param value - ISO 8601 string, Date object, or null/undefined
 * @param format - User's date format preference
 * @returns Formatted date string or "n/a" if invalid
 * @example
 * formatDate("2024-03-15T00:00:00.000Z", "MM/DD/YYYY") // "03/15/2024"
 * formatDate("2024-03-15T00:00:00.000Z", "DD/MM/YYYY") // "15/03/2024"
 * formatDate("2024-03-15T00:00:00.000Z", "YYYY/MM/DD") // "2024/03/15"
 * formatDate(null, "MM/DD/YYYY")                       // "n/a"
 */
export function formatDate(
  value: string | Date | null | undefined,
  format: DateFormat = "MM/DD/YYYY",
): string {
  if (!value) return "n/a";

  const parts = extractDateParts(value);
  if (!parts) {
    console.error(`Invalid date format: expected ISO 8601, got "${String(value)}"`);
    return "Invalid date";
  }

  return formatPartsToString(parts, format);
}

/**
 * Formats a date as "Mon YYYY" (e.g., "Mar 2024").
 * Month and year order respects the user's format preference.
 *
 * @param value - ISO 8601 string, Date object, or null/undefined
 * @param format - User's date format preference
 * @returns Formatted "Mon YYYY" or "YYYY Mon" string, or "n/a" if invalid
 * @example
 * formatMonthYear("2024-03-15T00:00:00.000Z", "MM/DD/YYYY") // "Mar 2024"
 * formatMonthYear("2024-03-15T00:00:00.000Z", "YYYY/MM/DD") // "2024 Mar"
 * formatMonthYear(null, "MM/DD/YYYY")                       // "n/a"
 */
export function formatMonthYear(
  value: string | Date | null | undefined,
  format: DateFormat = "MM/DD/YYYY",
): string {
  if (!value) return "n/a";

  const parts = extractDateParts(value);
  if (!parts) {
    console.error(`Invalid date format: expected ISO 8601, got "${String(value)}"`);
    return "Invalid date";
  }

  if (parts.month < 1 || parts.month > 12) {
    console.error(`Invalid month: ${parts.month}`);
    return "Invalid date";
  }

  const monthName = MONTH_NAMES[parts.month - 1];

  // Year-first formats show year first
  if (isYearFirstFormat(format)) {
    return `${parts.year} ${monthName}`;
  }

  return `${monthName} ${parts.year}`;
}

/**
 * Formats a timestamp with both date and time.
 * Used for fields like createdAt, updatedAt that include time.
 *
 * @param value - ISO 8601 string, Date object, or null/undefined
 * @param format - User's date format preference
 * @returns Formatted date with time string, or "n/a" if invalid
 * @example
 * formatTimestamp("2024-03-15T14:30:00.000Z", "MM/DD/YYYY") // "03/15/2024, 2:30 PM"
 * formatTimestamp("2024-03-15T14:30:00.000Z", "YYYY/DD/MM") // "2024/15/03, 14:30"
 */
export function formatTimestamp(
  value: string | Date | null | undefined,
  format: DateFormat = "MM/DD/YYYY",
): string {
  if (!value) return "n/a";

  const parts = extractDateParts(value);
  if (!parts) {
    console.error(`Invalid date format: expected ISO 8601, got "${String(value)}"`);
    return "Invalid date";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    console.error(`Failed to parse timestamp: "${String(value)}"`);
    return "Invalid date";
  }

  const datePart = formatPartsToString(parts, format);

  // Use 24-hour format for year-first formats, 12-hour for others
  const timeOptions: Intl.DateTimeFormatOptions = isYearFirstFormat(format)
    ? { hour: "2-digit", minute: "2-digit", hour12: false }
    : { hour: "numeric", minute: "2-digit", hour12: true };

  const timePart = date.toLocaleTimeString(undefined, timeOptions);

  return `${datePart}, ${timePart}`;
}

/**
 * Parses a date value to a Date object in the local timezone.
 * Used by date picker components to convert database values to Date objects.
 * Extracts the date portion and rebuilds as local midnight to avoid timezone shifts.
 *
 * @param value - ISO 8601 string, Date object, or null/undefined
 * @returns Date object at local midnight, or undefined if invalid
 */
export function parseLocalDate(value: string | Date | null | undefined): Date | undefined {
  if (!value) return undefined;

  // Extract date parts (uses UTC for Date objects, string parsing for strings)
  const parts = extractDateParts(value);
  if (!parts) return undefined;

  // Build a local date from the extracted parts (avoids timezone shift)
  const date = new Date(parts.year, parts.month - 1, parts.day);
  if (Number.isNaN(date.getTime())) return undefined;

  // Validate the date wasn't rolled over (e.g., Feb 30 -> Mar 2)
  if (
    date.getFullYear() !== parts.year ||
    date.getMonth() !== parts.month - 1 ||
    date.getDate() !== parts.day
  ) {
    return undefined;
  }

  return date;
}
