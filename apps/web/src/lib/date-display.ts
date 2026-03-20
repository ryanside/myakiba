import { format as formatDateFns, intervalToDuration, parseISO } from "date-fns";
import { parseDateOnly } from "@myakiba/utils/date-only";
import type { DateFormat } from "@myakiba/types/enums";

const DATE_PATTERN_BY_FORMAT: Readonly<Record<DateFormat, string>> = {
  "MM/DD/YYYY": "MM/dd/yyyy",
  "DD/MM/YYYY": "dd/MM/yyyy",
  "YYYY/MM/DD": "yyyy/MM/dd",
  "YYYY/DD/MM": "yyyy/dd/MM",
};

const TIMESTAMP_PATTERN_BY_FORMAT: Readonly<Record<DateFormat, string>> = {
  "MM/DD/YYYY": "MM/dd/yyyy, h:mm a",
  "DD/MM/YYYY": "dd/MM/yyyy, h:mm a",
  "YYYY/MM/DD": "yyyy/MM/dd, HH:mm",
  "YYYY/DD/MM": "yyyy/dd/MM, HH:mm",
};

const YEAR_FIRST_FORMATS = new Set<DateFormat>(["YYYY/MM/DD", "YYYY/DD/MM"]);

const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
  style: "narrow",
});

function parseTimestampValue(value: string | Date): Date | null {
  const date = value instanceof Date ? new Date(value) : parseISO(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Formats a date-only value for UI display using the user's preferred date format.
 *
 * @example
 * formatDateOnlyForDisplay("2024-03-15", "MM/DD/YYYY")
 * // "03/15/2024"
 *
 * @example
 * formatDateOnlyForDisplay("2024-03-15", "DD/MM/YYYY")
 * // "15/03/2024"
 *
 * @example
 * formatDateOnlyForDisplay(null)
 * // "n/a"
 */
export function formatDateOnlyForDisplay(
  value: string | Date | null | undefined,
  format: DateFormat = "MM/DD/YYYY",
): string {
  if (!value) return "n/a";

  const date = parseDateOnly(value);
  if (!date) return "Invalid date";

  return formatDateFns(date, DATE_PATTERN_BY_FORMAT[format]);
}

/**
 * Formats a date-only value as month and year for compact UI labels.
 *
 * @example
 * formatMonthYearForDisplay("2024-03-15", "MM/DD/YYYY")
 * // "Mar 2024"
 *
 * @example
 * formatMonthYearForDisplay("2024-03-15", "YYYY/MM/DD")
 * // "2024 Mar"
 *
 * @example
 * formatMonthYearForDisplay(null)
 * // "n/a"
 */
export function formatMonthYearForDisplay(
  value: string | Date | null | undefined,
  format: DateFormat = "MM/DD/YYYY",
): string {
  if (!value) return "n/a";

  const date = parseDateOnly(value);
  if (!date) return "Invalid date";

  return formatDateFns(date, YEAR_FIRST_FORMATS.has(format) ? "yyyy LLL" : "LLL yyyy");
}

/**
 * Formats a timestamp value for UI display using the user's preferred date format.
 *
 * @example
 * formatTimestampForDisplay("2024-03-15T14:30:00", "MM/DD/YYYY")
 * // "03/15/2024, 2:30 PM"
 *
 * @example
 * formatTimestampForDisplay("2024-03-15T14:30:00", "YYYY/MM/DD")
 * // "2024/03/15, 14:30"
 *
 * @example
 * formatTimestampForDisplay(null)
 * // "n/a"
 */
export function formatTimestampForDisplay(
  value: string | Date | null | undefined,
  format: DateFormat = "MM/DD/YYYY",
): string {
  if (!value) return "n/a";

  const date = parseTimestampValue(value);
  if (!date) return "Invalid date";

  return formatDateFns(date, TIMESTAMP_PATTERN_BY_FORMAT[format]);
}

/**
 * Formats a short localized date-time label for UI metadata.
 *
 * @example
 * formatShortDateTime(new Date(2024, 2, 15, 14, 30), "en-US")
 * // "Mar 15, 2:30 PM"
 */
export function formatShortDateTime(date: Date, locale?: Intl.LocalesArgument): string {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

/**
 * Formats an elapsed sync duration into a compact human-readable label.
 *
 * @example
 * formatSyncDuration(new Date(2024, 2, 15, 10, 0, 0), new Date(2024, 2, 15, 10, 1, 5))
 * // "1m 5s"
 *
 * @example
 * formatSyncDuration(new Date(2024, 2, 15, 10, 0, 0), null)
 * // "-"
 */
export function formatSyncDuration(start: Date, end: Date | null): string {
  if (!end) return "-";

  const startDate = new Date(start);
  const endDate = new Date(end);
  const ms = endDate.getTime() - startDate.getTime();
  if (Number.isNaN(ms)) return "-";
  if (ms < 1000) return "<1s";

  const duration = intervalToDuration({ start: startDate, end: endDate });
  const seconds = duration.seconds ?? 0;
  const minutes =
    (duration.minutes ?? 0) + (duration.hours ?? 0) * 60 + (duration.days ?? 0) * 24 * 60;

  if (minutes < 1) return `${seconds}s`;
  if (minutes < 60) return `${minutes}m ${seconds}s`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Formats a date relative to the current time for recent activity UI.
 *
 * @example
 * formatRelativeTimeToNow(new Date(Date.now() - 30_000))
 * // "just now"
 *
 * @example
 * formatRelativeTimeToNow(new Date(Date.now() - 2 * 60 * 60 * 1000))
 * // "2h ago"
 */
export function formatRelativeTimeToNow(date: Date): string {
  const timestamp = new Date(date).getTime();
  if (Number.isNaN(timestamp)) return "-";

  const diffSeconds = Math.round((timestamp - Date.now()) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  if (absSeconds < 60) return "just now";

  if (absSeconds < 60 * 60) {
    return RELATIVE_TIME_FORMATTER.format(Math.round(diffSeconds / 60), "minute");
  }

  if (absSeconds < 60 * 60 * 24) {
    return RELATIVE_TIME_FORMATTER.format(Math.round(diffSeconds / (60 * 60)), "hour");
  }

  return RELATIVE_TIME_FORMATTER.format(Math.round(diffSeconds / (60 * 60 * 24)), "day");
}
