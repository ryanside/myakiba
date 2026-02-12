import * as z from "zod";
import { ORDER_CASCADE_OPTIONS } from "@myakiba/constants/orders";
import { syncOrderSchema } from "./sync";

export const newOrderSchema = syncOrderSchema.omit({
  id: true,
  userId: true,
});

export const editedOrderSchema = newOrderSchema.extend({
  orderId: z.string(),
});

export const cascadeOptionSchema = z.enum(ORDER_CASCADE_OPTIONS);
export const cascadeOptionsSchema = z.array(cascadeOptionSchema);

export type NewOrder = z.infer<typeof newOrderSchema>;
export type EditedOrder = z.infer<typeof editedOrderSchema>;
export type CascadeOption = z.infer<typeof cascadeOptionSchema>;
export type CascadeOptions = z.infer<typeof cascadeOptionsSchema>;
