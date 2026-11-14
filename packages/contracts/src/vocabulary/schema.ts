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

export type ShopTerm = z.infer<typeof shopTermSchema>;

export const vocabularyResponseSchema = z.object({
  shops: z.array(shopTermSchema),
});

export type VocabularyResponse = z.infer<typeof vocabularyResponseSchema>;
