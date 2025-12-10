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
      throw new Error("Invalid date");
    }
    return date.toISOString().split("T")[0]!; // Return YYYY-MM-DD format
  } catch {
    // If all else fails, return a default date or throw an error
    console.warn(`Unable to parse date: "${dateStr}". Using fallback date.`);
    return "1970-01-01"; // Fallback date
  }
};

/**
 * Formats a date string for display in the user's locale.
 * Parses the date as local time to avoid timezone issues.
 */
export function formatDate(dateString: string | null): string {
  if (!dateString) return "n/a";
  try {
    // Parse date as local date to avoid timezone issues
    // When "2026-04-01" is parsed as new Date(), it's treated as UTC midnight
    // which gets converted to the previous day in timezones behind UTC
    const [year, month, day] = dateString.split("-").map(Number);
    const date = new Date(year!, month! - 1, day);
    return date.toLocaleDateString();
  } catch {
    return "Invalid Date";
  }
}

/**
 * Parses a YYYY-MM-DD string to a Date object in the local timezone.
 */
export function parseLocalDate(dateString: string): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year!, month! - 1, day);
}

