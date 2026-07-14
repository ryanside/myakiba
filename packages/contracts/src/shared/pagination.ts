import * as z from "zod";
import { MAX_LIMIT } from "./constants";

export const paginationLimitSchema = z.coerce.number().int().positive().max(MAX_LIMIT);
export const paginationOffsetSchema = z.coerce.number().int().nonnegative();
export const paginationPageSchema = z.coerce.number().int().positive();
