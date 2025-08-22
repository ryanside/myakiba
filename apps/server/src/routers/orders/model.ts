import { z } from "zod";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { order } from "@/db/schema/figure";

export const orderSelectSchema = createSelectSchema(order);
export const orderInsertSchema = createInsertSchema(order);
export const orderUpdateSchema = createUpdateSchema(order);

export type orderSelectType = z.infer<typeof orderSelectSchema>;
export type orderInsertType = z.infer<typeof orderInsertSchema>;
export type orderUpdateType = z.infer<typeof orderUpdateSchema>;
