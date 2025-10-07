import * as z from "zod";
import { createInsertSchema, createUpdateSchema } from "drizzle-zod";
import { collection, order } from "@/db/schema/figure";

export const orderInsertSchema = createInsertSchema(order);
export const orderUpdateSchema = createUpdateSchema(order);

export type orderInsertType = z.infer<typeof orderInsertSchema>;
export type orderUpdateType = z.infer<typeof orderUpdateSchema>;

export const orderItemUpdateSchema = createUpdateSchema(collection);
export type orderItemUpdateType = z.infer<typeof orderItemUpdateSchema>;
