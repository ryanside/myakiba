/**
 * Sanitizes a date string, returning null for invalid dates.
 * Used primarily for validating date strings from external sources.
 */
export const sanitizeDate = (dateString: string | null): string | null => {
  if (dateString === "0000-00-00" || !dateString || dateString.trim() === "") {
    return null;
  }

  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return null;
    }
    return dateString;
  } catch {
    return null;
  }
};

/**
 * Normalizes various date string formats to YYYY-MM-DD format.
 * Handles year-only (e.g., "2006") and MM/YYYY formats (e.g., "09/2010").
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

  // Try to parse as a regular date - if it fails, default to a fallback
  try {
    const date = new Date(trimmed);
    if (isNaN(date.getTime())) {
      console.error(
        `Invalid date format: expected YYYY-MM-DD, got "${dateStr}"`
      );
      return "Invalid date";
    }
    return date.toISOString().split("T")[0]!; // Return YYYY-MM-DD format
  } catch {
    // If all else fails, return a default date or throw an error
    console.error(
      `Invalid date format: expected YYYY-MM-DD, got "${dateStr}"`
    );
    return "Invalid date";
  }
};

/**
 * Formats a date string for display in the user's locale.
 * Parses the date as local time to avoid timezone issues.
 * Handles both YYYY-MM-DD and ISO 8601 formats (YYYY-MM-DDTHH:mm:ss.sssZ).
 */
type DateInput = string | Date | null | undefined;

type DateParts = Readonly<{
  year: number;
  month: number;
  day: number;
}>;

const toDatePartsFromString = (value: string): DateParts | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const datePart = trimmed.split("T")[0] ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;

  const [year, month, day] = datePart.split("-").map(Number);
  if (!year || !month || !day) return null;

  const parts: DateParts = { year, month, day };
  return parts;
};

const isUtcMidnight = (value: Date): boolean =>
  value.getUTCHours() === 0 &&
  value.getUTCMinutes() === 0 &&
  value.getUTCSeconds() === 0 &&
  value.getUTCMilliseconds() === 0;

const isLocalMidnight = (value: Date): boolean =>
  value.getHours() === 0 &&
  value.getMinutes() === 0 &&
  value.getSeconds() === 0 &&
  value.getMilliseconds() === 0;

const toDatePartsFromDate = (value: Date): DateParts | null => {
  if (Number.isNaN(value.getTime())) return null;

  const useUtcParts = isUtcMidnight(value) && !isLocalMidnight(value);

  const parts: DateParts = useUtcParts
    ? {
        year: value.getUTCFullYear(),
        month: value.getUTCMonth() + 1,
        day: value.getUTCDate(),
      }
    : {
        year: value.getFullYear(),
        month: value.getMonth() + 1,
        day: value.getDate(),
      };

  return parts;
};

const toDateParts = (value: DateInput): DateParts | null => {
  if (!value) return null;
  if (value instanceof Date) return toDatePartsFromDate(value);
  return toDatePartsFromString(value);
};

const buildLocalDate = (parts: DateParts): Date | null => {
  const date = new Date(parts.year, parts.month - 1, parts.day);
  if (Number.isNaN(date.getTime())) return null;

  if (
    date.getFullYear() !== parts.year ||
    date.getMonth() !== parts.month - 1 ||
    date.getDate() !== parts.day
  ) {
    return null;
  }

  return date;
};

export function formatDate(value: DateInput): string {
  if (!value) return "n/a";

  try {
    const parts = toDateParts(value);
    if (!parts) {
      console.error(
        `Invalid date format: expected YYYY-MM-DD or ISO 8601, got "${String(value)}"`
      );
      return "Invalid date";
    }

    // Parse date as local date to avoid timezone issues
    // When "2026-04-01" is parsed as new Date(), it's treated as UTC midnight
    // which gets converted to the previous day in timezones behind UTC
    const date = buildLocalDate(parts);
    if (!date) {
      console.error(`Failed to parse date: "${String(value)}"`);
      return "Invalid date";
    }

    return date.toLocaleDateString();
  } catch {
    console.error(`Failed to parse date: "${String(value)}"`);
    return "Invalid date";
  }
}

/**
 * Parses a YYYY-MM-DD or ISO 8601 string to a Date object in the local timezone.
 */
export function parseLocalDate(value: DateInput): Date | undefined {
  const parts = toDateParts(value);
  if (!parts) return undefined;

  const date = buildLocalDate(parts);
  return date ?? undefined;
}

/**
 * Formats a YYYY-MM-DD date string as "Month Year" (e.g., "Mar 2024").
 * Avoids timezone issues by parsing the date string directly.
 */
export function formatMonthYear(value: DateInput): string {
  if (!value) return "n/a";

  try {
    const parts = toDateParts(value);
    if (!parts) {
      console.error(
        `Invalid date format: expected YYYY-MM-DD or ISO 8601, got "${String(value)}"`
      );
      return "Invalid date";
    }

    const monthNames: readonly string[] = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];

    if (parts.month < 1 || parts.month > 12) {
      console.error(`Invalid month: ${parts.month}`);
      return "Invalid date";
    }

    return `${monthNames[parts.month - 1]} ${parts.year}`;
  } catch {
    console.error(`Failed to parse date: "${String(value)}"`);
    return "Invalid date";
  }
}

/**
 * Normalizes a date string from a database to a YYYY-MM-DD format.
 */
export function normalizeDbDate(value: string | null | undefined): string | null {
  if (value == null) return null;

  if (typeof value === "string") {
    // Already a date-only string from Postgres DATE
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

    // ISO string (or similar)
    if (value.includes("T")) return value.split("T")[0] ?? null;

    // Fallback: try parsing and normalizing
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? null
      : (parsed.toISOString().split("T")[0] ?? null);
  }

  return null;
}
