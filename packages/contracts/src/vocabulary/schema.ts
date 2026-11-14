import * as z from "zod";
import { WRITE_LIMITS } from "../shared/write-limits";

const shopTermSchema = z.object({
  value: z.string(),
  /** Every Collection Item and Order that names this shop, which ranks suggestions. */
  uses: z.number().int(),
  /** Owned Collection Items, the ones the Collection page and its filter list. */
  ownedUses: z.number().int(),
  orderUses: z.number().int(),
  lastUsedAt: z.string(),
});

const tagTermSchema = z.object({
  value: z.string(),
  /** Every Collection Item with this tag, which ranks suggestions. */
  uses: z.number().int(),
  /** Owned Collection Items, the ones the Collection page and its filter list. */
  ownedUses: z.number().int(),
  lastUsedAt: z.string(),
});

const scaleTermSchema = z.object({
  value: z.string(),
  /** Owned Collection Items whose Item has this scale. */
  ownedUses: z.number().int(),
});

export type ShopTerm = z.infer<typeof shopTermSchema>;
export type TagTerm = z.infer<typeof tagTermSchema>;

export const vocabularyResponseSchema = z.object({
  shops: z.array(shopTermSchema),
  tags: z.array(tagTermSchema),
  scales: z.array(scaleTermSchema),
});

export type VocabularyResponse = z.infer<typeof vocabularyResponseSchema>;

/**
 * Renames each of the viewer's shops in `from` to `to` everywhere it is saved, so several spellings
 * merge into one. A `to` already in use merges into it too. Each `from` names a saved shop exactly
 * as stored, so it is not trimmed.
 */
export const renameShopSchema = z
  .strictObject({
    from: z
      .array(z.string().min(1, "Shop is required").max(WRITE_LIMITS.shop))
      .min(1, "Shop is required")
      .max(WRITE_LIMITS.shops)
      .refine((from) => new Set(from).size === from.length, { error: "Shops must be unique" }),
    to: z.string().trim().min(1, "Shop is required").max(WRITE_LIMITS.shop),
  })
  .refine(({ from, to }) => !from.includes(to), { error: "The new name matches an old one" });

export type RenameShop = z.infer<typeof renameShopSchema>;

/** How many of the viewer's Collection Items and Orders name a shop, or a rename changed. */
export type ShopUses = { readonly collectionItems: number; readonly orders: number };
