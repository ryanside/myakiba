import { z } from "zod";

export const csvItemSchema = z.object({
  id: z.int(),
  status: z.string(),
  count: z.int(),
  score: z.string(),
  payment_date: z.string(),
  shipping_date: z.string(),
  collecting_date: z.string(),
  price: z.string(),
  shop: z.string(),
  shipping_method: z.string(),
  tracking_number: z.string(),
  note: z.string(),
});

export type csvItem = z.infer<typeof csvItemSchema>;

export const statusSchema = z.object({
  status: z.string(),
  finished: z.boolean(),
  createdAt: z.string(),
});

export type status = z.infer<typeof statusSchema>;

