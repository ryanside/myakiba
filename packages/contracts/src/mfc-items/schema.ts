import * as z from "zod";
import { MAX_MFC_ITEM_ID } from "../shared/constants";

const MAX_ITEM_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_MISSING_LOOKUP_IDS = 1000;

export const MAX_ITEM_PICTURE_BYTES = 10 * 1024 * 1024;
export const MAX_ITEM_FAILURES_PER_REPORT = 1000;

export const mfcItemIdField = z.int().min(1).max(MAX_MFC_ITEM_ID);

export const missingItemsSchema = z.strictObject({
  mfcItemIds: z
    .array(mfcItemIdField)
    .min(1)
    .max(MAX_MISSING_LOOKUP_IDS)
    .refine((ids) => new Set(ids).size === ids.length, "MFC item ids must be unique"),
});

export type MissingItemsInput = z.infer<typeof missingItemsSchema>;

const isPageSize = (bytes: number) => bytes > 0 && bytes <= MAX_ITEM_PAGE_BYTES;
const PAGE_SIZE_MESSAGE = "The item page is empty or larger than 2 MB";

const itemPageFields = {
  page: z.union([
    z.instanceof(File).refine((page) => isPageSize(page.size), PAGE_SIZE_MESSAGE),
    z
      .string()
      .refine((page) => isPageSize(new TextEncoder().encode(page).byteLength), PAGE_SIZE_MESSAGE),
  ]),
  picture: z.instanceof(File).optional(),
};

export const itemUploadSchema = z.strictObject({
  mfcItemId: z.union([
    mfcItemIdField,
    z
      .string()
      .regex(/^[1-9]\d*$/u)
      .transform(Number)
      .pipe(mfcItemIdField),
  ]),
  ...itemPageFields,
});

export type ItemUpload = z.infer<typeof itemUploadSchema>;

export const itemRefreshSchema = z.strictObject(itemPageFields);

export type ItemRefresh = z.infer<typeof itemRefreshSchema>;
