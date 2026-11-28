import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { ReleaseDate } from "@myakiba/contracts/shared/release-date";

const pair = (start: AnyPgColumn, precision: AnyPgColumn) =>
  sql`jsonb_build_object('start', ${start}, 'precision', ${precision})`;

export function releaseDateOf(start: AnyPgColumn, precision: AnyPgColumn) {
  return sql<ReleaseDate>`${pair(start, precision)}`;
}

export function optionalReleaseDateOf(start: AnyPgColumn, precision: AnyPgColumn) {
  return sql<ReleaseDate | null>`CASE WHEN ${start} IS NULL THEN NULL ELSE ${pair(start, precision)} END`;
}

function orderReleaseColumns(releaseDate: ReleaseDate | null) {
  return {
    releaseDate: releaseDate?.start ?? null,
    releaseDatePrecision: releaseDate?.precision ?? "day",
  } as const;
}

export function withOrderReleaseColumns<T extends { readonly releaseDate?: ReleaseDate | null }>({
  releaseDate,
  ...fields
}: T) {
  return releaseDate === undefined ? fields : { ...fields, ...orderReleaseColumns(releaseDate) };
}
