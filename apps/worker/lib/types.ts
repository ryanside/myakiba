import type { Job } from "bullmq";
import type Redis from "ioredis";
import type {
  JobData,
  InternalCsvItem,
  UpdatedSyncOrder,
  UpdatedSyncOrderItem,
  UpdatedSyncCollection,
} from "@myakiba/schemas";
import type { SyncSessionStatus, Category } from "@myakiba/types";

export type ScrapedItem = {
  id: number;
  title: string;
  category: Category;
  classification: {
    id: number;
    name: string;
    role: string;
  }[];
  origin: {
    id: number;
    name: string;
  }[];
  character: {
    id: number;
    name: string;
  }[];
  company: {
    id: number;
    name: string;
    role: string;
  }[];
  artist: {
    id: number;
    name: string;
    role: string;
  }[];
  version: string[];
  releaseDate: {
    date: string;
    type: string;
    price: number;
    priceCurrency: string;
    barcode: string;
  }[];
  event: {
    id: number;
    name: string;
    role: string;
  }[];
  materials: {
    id: number;
    name: string;
  }[];
  scale: string;
  height: number;
  width: number;
  depth: number;
  image: string;
};

export interface jobData extends Job {
  data: JobData;
}

export type SetJobStatusParams = {
  readonly redis: Redis;
  readonly jobId: string;
  readonly statusMessage: string;
  readonly finished: boolean;
  readonly syncSessionId?: string;
  readonly sessionStatus?: SyncSessionStatus;
};

export type BatchUpdateSyncSessionItemStatusesParams = {
  readonly syncSessionId: string;
  readonly scrapedItemIds: readonly number[];
  readonly failedItemIds: readonly number[];
};

export type UpdateSyncSessionCountsParams = {
  readonly syncSessionId: string;
  readonly successCount: number;
  readonly failCount: number;
};

export type ScrapeImageParams = {
  readonly imageUrl: string;
  readonly maxRetries?: number;
  readonly baseDelayMs?: number;
};

export type ScrapeSingleItemParams = {
  readonly id: number;
  readonly userId: string;
  readonly jobId: string;
  readonly overallIndex: number;
  readonly totalItems: number;
  readonly maxRetries?: number;
  readonly baseDelayMs?: number;
};

export type ScrapeItemsParams = {
  readonly itemIds: readonly number[];
  readonly userId: string;
  readonly jobId: string;
  readonly maxRetries?: number;
  readonly baseDelayMs?: number;
  readonly startingIndex?: number;
  readonly totalItems?: number;
};

export type FinalizeCollectionSyncParams = {
  readonly successfulResults: ScrapedItem[];
  readonly job: jobData;
  readonly redis: Redis;
  readonly itemsToScrape: UpdatedSyncCollection[];
  readonly itemsToInsert: UpdatedSyncCollection[];
  readonly syncSessionId: string;
};

export type FinalizeOrderSyncParams = {
  readonly successfulResults: ScrapedItem[];
  readonly job: jobData;
  readonly redis: Redis;
  readonly details: UpdatedSyncOrder;
  readonly itemsToScrape: UpdatedSyncOrderItem[];
  readonly itemsToInsert: UpdatedSyncOrderItem[];
  readonly syncSessionId: string;
};

export type FinalizeCsvSyncParams = {
  readonly successfulResults: ScrapedItem[];
  readonly job: jobData;
  readonly userId: string;
  readonly redis: Redis;
  readonly csvItems: InternalCsvItem[];
  readonly syncSessionId: string;
};
