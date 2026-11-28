import { addMonths, parseISO } from "date-fns";
import { getDateOnlyMonthBounds } from "@myakiba/utils/date-only";
import type { ReleaseMonth } from "@myakiba/contracts/orders/schema";

export function releaseMonthRange(
  releaseMonth: ReleaseMonth,
  today: string,
): ReturnType<typeof getDateOnlyMonthBounds> {
  const day = parseISO(today);
  const month = releaseMonth === "this" ? day : addMonths(day, 1);
  return getDateOnlyMonthBounds(month.getFullYear(), month.getMonth() + 1);
}
