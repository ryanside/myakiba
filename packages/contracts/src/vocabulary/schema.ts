import * as z from "zod";

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
