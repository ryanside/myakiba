import { format as formatDateFns } from "date-fns";
import { parseDateOnly } from "@myakiba/utils/date-only";
import type { DateFormat } from "@myakiba/contracts/shared/types";

const DATE_PATTERN_BY_FORMAT = {
  "MM/DD/YYYY": "MM/dd/yyyy",
  "DD/MM/YYYY": "dd/MM/yyyy",
  "YYYY/MM/DD": "yyyy/MM/dd",
  "YYYY/DD/MM": "yyyy/dd/MM",
} satisfies Readonly<Record<DateFormat, string>>;

const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat("en-US", {
  numeric: "auto",
  style: "narrow",
});

export function formatDateOnlyForDisplay(
  value: string | Date | null | undefined,
  format: DateFormat = "MM/DD/YYYY",
): string {
  if (!value) return "n/a";

  const date = value instanceof Date ? value : parseDateOnly(value);
  if (!date) return "Invalid date";

  return formatDateFns(date, DATE_PATTERN_BY_FORMAT[format]);
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
