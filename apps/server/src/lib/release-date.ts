import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { ReleaseDate } from "@myakiba/contracts/shared/release-date";

const pair = (start: AnyPgColumn, precision: AnyPgColumn) =>
  sql`jsonb_build_object('start', ${start}, 'precision', ${precision})`;

/** A release date and its precision, read as one value. */
export function releaseDateOf(start: AnyPgColumn, precision: AnyPgColumn) {
  return sql<ReleaseDate>`${pair(start, precision)}`;
}

/** As releaseDateOf, for a date that may be missing, as an Order's or a left-joined release's. */
export function optionalReleaseDateOf(start: AnyPgColumn, precision: AnyPgColumn) {
  return sql<ReleaseDate | null>`CASE WHEN ${start} IS NULL THEN NULL ELSE ${pair(start, precision)} END`;
}

/** The two Order columns a release date writes. A missing date keeps `day`, which means nothing. */
function orderReleaseColumns(releaseDate: ReleaseDate | null) {
  return {
    releaseDate: releaseDate?.start ?? null,
    releaseDatePrecision: releaseDate?.precision ?? "day",
  } as const;
}

/** An Order write with its release date stored as the two columns, when the write names one. */
export function withOrderReleaseColumns<T extends { readonly releaseDate?: ReleaseDate | null }>({
  releaseDate,
  ...fields
}: T) {
  return releaseDate === undefined ? fields : { ...fields, ...orderReleaseColumns(releaseDate) };
}
