import { collection } from "@/db/schema/figure";
import { z } from "zod";
import { createInsertSchema, createUpdateSchema } from "drizzle-zod";

export const insertCollectionSchema = createInsertSchema(collection);

export type insertCollectionType = z.infer<typeof insertCollectionSchema>;

export const updateCollectionSchema = createUpdateSchema(collection);

export type updateCollectionType = z.infer<typeof updateCollectionSchema>;
