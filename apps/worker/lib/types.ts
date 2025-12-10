import type { Job } from "bullmq";
import type { JobData } from "@myakiba/validations";

export type { ScrapedItem as scrapedItem } from "@myakiba/types";

export {
  syncOrderSchema,
  syncOrderItemSchema,
  syncCollectionItemSchema,
  jobDataSchema,
  type InternalCsvItem as CsvItem,
  type UpdatedSyncOrder,
  type UpdatedSyncOrderItem,
  type UpdatedSyncCollection,
  type JobData,
} from "@myakiba/validations";

export interface jobData extends Job {
  data: JobData;
}
