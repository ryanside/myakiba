import { format as formatDateFns, parseISO } from "date-fns";
import { parseDateOnly } from "@myakiba/utils/date-only";
import type { DateFormat } from "@myakiba/contracts/shared/types";
import { RELEASE_DATE_PRECISIONS } from "@myakiba/contracts/shared/constants";
import type { ReleaseDate } from "@myakiba/contracts/shared/release-date";

const DATE_PATTERN_BY_FORMAT = {
  "MM/DD/YYYY": "MM/dd/yyyy",
  "DD/MM/YYYY": "dd/MM/yyyy",
  "YYYY/MM/DD": "yyyy/MM/dd",
  "YYYY/DD/MM": "yyyy/dd/MM",
} satisfies Readonly<Record<DateFormat, string>>;

const TIMESTAMP_PATTERN_BY_FORMAT = {
  "MM/DD/YYYY": "MM/dd/yyyy, h:mm a",
  "DD/MM/YYYY": "dd/MM/yyyy, h:mm a",
  "YYYY/MM/DD": "yyyy/MM/dd, HH:mm",
  "YYYY/DD/MM": "yyyy/dd/MM, HH:mm",
} satisfies Readonly<Record<DateFormat, string>>;

const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat("en-US", {
  numeric: "auto",
  style: "narrow",
});

function parseTimestampValue(value: string | Date): Date | null {
  const date = value instanceof Date ? new Date(value) : parseISO(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateOnlyForDisplay(
  value: string | Date | null | undefined,
  format: DateFormat = "MM/DD/YYYY",
): string {
  if (!value) return "n/a";

  const date = value instanceof Date ? value : parseDateOnly(value);
  if (!date) return "Invalid date";

  return formatDateFns(date, DATE_PATTERN_BY_FORMAT[format]);
}

const RELEASE_PATTERN_BY_PRECISION = {
  month: "MMM yyyy",
  year: "yyyy",
} satisfies Readonly<Record<Exclude<ReleaseDate["precision"], "day">, string>>;

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

type ReleaseDayStyle = DateFormat | "long" | "weekday";

export function formatReleaseDate(
  value: ReleaseDate | null | undefined,
  dayStyle: ReleaseDayStyle = "MM/DD/YYYY",
): string {
  if (!value) return "n/a";
  const date = parseDateOnly(value.start);
  if (!date) return "Invalid date";
  if (value.precision !== "day") {
    return formatDateFns(date, RELEASE_PATTERN_BY_PRECISION[value.precision]);
  }
  switch (dayStyle) {
    case "long":
      return formatDateFns(date, "PPP");
    case "weekday":
      return WEEKDAY_FORMATTER.format(date);
    default:
      return formatDateFns(date, DATE_PATTERN_BY_FORMAT[dayStyle]);
  }
}

/** A month view names its month already, so a release known only to that month has no caption. */
export function releaseGroupCaption(date: ReleaseDate): string | null {
  return date.precision === "month" ? null : formatReleaseDate(date, "weekday");
}

const breadth = (date: ReleaseDate) => RELEASE_DATE_PRECISIONS.indexOf(date.precision);

export function releaseCalendarOrder(a: ReleaseDate, b: ReleaseDate): number {
  return a.start.localeCompare(b.start) || breadth(b) - breadth(a);
}

export function formatTimestampForDisplay(
  value: string | Date | null | undefined,
  format: DateFormat = "MM/DD/YYYY",
): string {
  if (!value) return "n/a";

  const date = parseTimestampValue(value);
  if (!date) return "Invalid date";

  return formatDateFns(date, TIMESTAMP_PATTERN_BY_FORMAT[format]);
}

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
