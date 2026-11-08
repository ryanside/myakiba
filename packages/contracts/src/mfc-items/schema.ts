import * as z from "zod";
import { MAX_MFC_ITEM_ID } from "../shared/constants";

const MAX_ITEM_PAGE_BYTES = 2 * 1024 * 1024;

export const MAX_ITEM_PICTURE_BYTES = 10 * 1024 * 1024;

const mfcItemIdField = z.int().min(1).max(MAX_MFC_ITEM_ID);

const isPageSize = (bytes: number) => bytes > 0 && bytes <= MAX_ITEM_PAGE_BYTES;
const PAGE_SIZE_MESSAGE = "The item page is empty or larger than 2 MB";

export const itemPageHtmlSchema = z
  .string()
  .refine((page) => isPageSize(new TextEncoder().encode(page).byteLength), PAGE_SIZE_MESSAGE);

const itemPageFields = {
  page: z.union([
    z.instanceof(File).refine((page) => isPageSize(page.size), PAGE_SIZE_MESSAGE),
    itemPageHtmlSchema,
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
