import * as z from "zod";
import { DEFAULT_LIMIT, MAX_LIMIT } from "./constants";

export const paginationLimitSchema = z.coerce.number<number>().int().positive().max(MAX_LIMIT);
export const paginationOffsetSchema = z.coerce.number<number>().int().nonnegative();
export const paginationPageSchema = z.coerce.number().int().positive();
export const sortDirectionSchema = z.enum(["asc", "desc"]);

export function pageFields<const TSort extends string>(
  sortSchema: z.ZodEnum<{ [K in TSort]: K }>,
  defaultSort: NoInfer<TSort>,
) {
  return {
    limit: paginationLimitSchema.default(DEFAULT_LIMIT),
    offset: paginationOffsetSchema.default(0),
    sort: sortSchema.default(defaultSort),
    order: sortDirectionSchema.default("desc"),
  };
}

/** The page fields of a parsed list query, as `pageFields` fills them. */
export type PageRequest<TSort extends string> = {
  readonly limit: number;
  readonly offset: number;
  readonly sort: TSort;
  readonly order: z.infer<typeof sortDirectionSchema>;
};

/** A server-paginated list response. `totalCount` counts the whole filtered set, not the page. */
export type Page<T> = {
  readonly items: readonly T[];
  readonly totalCount: number;
};
