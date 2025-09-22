import { z } from "zod";

export const searchSchema = z.object({
  limit: z.coerce.number().optional(),
  offset: z.coerce.number().optional(),
  sort: z
    .enum([
      "title",
      "shop",
      "orderDate",
      "releaseMonthYear",
      "shippingMethod",
      "total",
      "itemCount",
      "createdAt",
    ])
    .optional(),
  order: z.enum(["asc", "desc"]).optional(),
  search: z.string().optional(),
});
