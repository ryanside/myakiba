import { z } from "zod";
import { createInsertSchema } from "drizzle-zod";
import { collection, order } from "@/db/schema/figure";

export const csvItemSchema = z.object({
  id: z.int(),
  status: z.string(),
  count: z.int(),
  score: z.string(),
  payment_date: z.string().nullable(),
  shipping_date: z.string().nullable(),
  collecting_date: z.string().nullable(),
  price: z.string(),
  shop: z.string(),
  shipping_method: z.string(),
  note: z.string(),
  orderId: z.string().nullable(),
  orderDate: z.string().nullable()
});

export type csvItem = z.infer<typeof csvItemSchema>

export const orderInsertSchema = createInsertSchema(order)

export type orderInsertType = z.infer<typeof orderInsertSchema>;

export const collectionInsertSchema = createInsertSchema(collection)

export type collectionInsertType = z.infer<typeof collectionInsertSchema>;

export const statusSchema = z.object({
  status: z.string(),
  finished: z.boolean(),
  createdAt: z.string(),
});

export type status = z.infer<typeof statusSchema>;

