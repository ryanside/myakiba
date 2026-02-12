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

export interface FullJobData extends Job {
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

export type MarkPersistFailedSyncSessionItemStatusesParams = {
  readonly syncSessionId: string;
  readonly scrapedItemIds: readonly number[];
  readonly errorReason: string;
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
  readonly job: FullJobData;
  readonly redis: Redis;
  readonly itemsToScrape: UpdatedSyncCollection[];
  readonly existingCount: number;
  readonly syncSessionId: string;
};

export type FinalizeOrderSyncParams = {
  readonly successfulResults: ScrapedItem[];
  readonly job: FullJobData;
  readonly redis: Redis;
  readonly details: UpdatedSyncOrder;
  readonly itemsToScrape: UpdatedSyncOrderItem[];
  readonly existingCount: number;
  readonly syncSessionId: string;
};

export type FinalizeCsvSyncParams = {
  readonly successfulResults: ScrapedItem[];
  readonly job: FullJobData;
  readonly userId: string;
  readonly redis: Redis;
  readonly csvItems: InternalCsvItem[];
  readonly existingCount: number;
  readonly syncSessionId: string;
};

export type AssembledItem = {
  externalId: number;
  source: "mfc";
  title: string;
  category: Category;
  version: string[];
  scale: string;
  height: number;
  width: number;
  depth: number;
  image: string;
};

export type AssembledItemRelease = {
  id: string;
  itemExternalId: number;
  date: string;
  type: string;
  price: number;
  priceCurrency: string;
  barcode: string;
};

export type AssembledEntry = {
  externalId: number;
  source: "mfc";
  category: string;
  name: string;
};

export type AssembledEntryToItem = {
  entryExternalId: number;
  itemExternalId: number;
  role: string;
};

export type LatestReleaseInfo = {
  releaseId: string | null;
  date: string | null;
};

export type AssembledScrapedData = {
  items: AssembledItem[];
  entries: AssembledEntry[];
  entryToItems: AssembledEntryToItem[];
  itemReleases: AssembledItemRelease[];
  latestReleaseIdByExternalId: Map<number, LatestReleaseInfo>;
};
