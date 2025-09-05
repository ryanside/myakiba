import { z } from "zod";

// Wrapped query parameter schemas
export const wrappedQuerySchema = z.object({
  year: z.coerce.number().optional().default(new Date().getFullYear()),
});

// Wrapped response schemas
export const wrappedStatsSchema = z.object({
  totalItemsAdded: z.number(),
  totalSpent: z.string().nullable(),
  totalOrders: z.number(),
  averageItemPrice: z.string().nullable(),
  mostExpensiveItem: z.object({
    title: z.string(),
    price: z.string().nullable(),
    category: z.string().nullable(),
  }).nullable(),
  topCategories: z.array(z.object({
    category: z.string().nullable(),
    count: z.number(),
    totalValue: z.string().nullable(),
  })),
  topShops: z.array(z.object({
    shop: z.string().nullable(),
    count: z.number(),
    totalSpent: z.string().nullable(),
  })),
  monthlyBreakdown: z.array(z.object({
    month: z.number(),
    itemsAdded: z.number(),
    amountSpent: z.string().nullable(),
  })),
  collectionGrowth: z.object({
    startOfYear: z.number(),
    endOfYear: z.number(),
    growth: z.number(),
    growthPercentage: z.number(),
  }),
});

export const wrappedResponseSchema = z.object({
  year: z.number(),
  stats: wrappedStatsSchema,
  summary: z.object({
    title: z.string(),
    description: z.string(),
    highlights: z.array(z.string()),
  }),
});

// Type exports
export type wrappedResponseType = z.infer<typeof wrappedResponseSchema>;
