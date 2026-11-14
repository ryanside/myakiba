import * as z from "zod";

const shopTermSchema = z.object({
  value: z.string(),
  ownedUses: z.number().int(),
  orderUses: z.number().int(),
  lastUsedAt: z.string(),
});

export type ShopTerm = z.infer<typeof shopTermSchema>;

export const vocabularyResponseSchema = z.object({
  shops: z.array(shopTermSchema),
});

export type VocabularyResponse = z.infer<typeof vocabularyResponseSchema>;
