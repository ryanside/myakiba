import type { Job } from "bullmq";
import type Redis from "ioredis";
import type { createLogger } from "evlog";
import type {
  JobData,
  InternalCsvItem,
  UpdatedSyncOrder,
  UpdatedSyncOrderItem,
  UpdatedSyncCollection,
} from "@myakiba/contracts/sync/schema";
import type { SyncSessionStatus, Category } from "@myakiba/contracts/shared/types";

export type ScrapeFailure = {
  readonly id: number;
  readonly attemptErrors: readonly string[];
};

export type ScrapeResult = {
  readonly successful: readonly ScrapedItem[];
  readonly failures: readonly ScrapeFailure[];
};

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
  readonly log: WorkerJobLogger;
  readonly maxRetries?: number;
  readonly baseDelayMs?: number;
};

export type ScrapeSingleItemParams = {
  readonly id: number;
  readonly jobId: string;
  readonly log: WorkerJobLogger;
  readonly overallIndex: number;
  readonly totalItems: number;
  readonly maxRetries?: number;
  readonly baseDelayMs?: number;
};

export type ScrapeItemsParams = {
  readonly itemIds: readonly number[];
  readonly jobId: string;
  readonly log: WorkerJobLogger;
  readonly maxRetries?: number;
  readonly baseDelayMs?: number;
  readonly startingIndex?: number;
  readonly totalItems?: number;
};

export type FinalizeCollectionSyncParams = {
  readonly successfulResults: ScrapedItem[];
  readonly job: FullJobData;
  readonly log: WorkerJobLogger;
  readonly redis: Redis;
  readonly itemsToScrape: UpdatedSyncCollection[];
  readonly existingCount: number;
  readonly syncSessionId: string;
};

export type FinalizeOrderSyncParams = {
  readonly successfulResults: ScrapedItem[];
  readonly job: FullJobData;
  readonly log: WorkerJobLogger;
  readonly redis: Redis;
  readonly details: UpdatedSyncOrder;
  readonly itemsToScrape: UpdatedSyncOrderItem[];
  readonly existingCount: number;
  readonly syncSessionId: string;
  readonly syncMode: "create" | "append";
};

export type FinalizeCsvSyncParams = {
  readonly successfulResults: ScrapedItem[];
  readonly job: FullJobData;
  readonly log: WorkerJobLogger;
  readonly userId: string;
  readonly redis: Redis;
  readonly csvItems: InternalCsvItem[];
  readonly existingCount: number;
  readonly syncSessionId: string;
};

export type FinalizePersistenceSummary = {
  readonly items: number;
  readonly itemReleases: number;
  readonly entries: number;
  readonly entryToItems: number;
  readonly collectionItems: number;
  readonly orders: number;
};

export type FinalizeSyncResult = {
  readonly processedAt: string;
  readonly successCount: number;
  readonly failCount: number;
  readonly scrapedPersistedRowCount: number;
  readonly sessionStatus: SyncSessionStatus;
  readonly statusMessage: string;
  readonly persistence: FinalizePersistenceSummary;
};

export type ProcessSyncJobContext = {
  readonly redis: Redis;
  readonly jobId: string;
  readonly syncSessionId: string;
  readonly userId: string;
  readonly log: WorkerJobLogger;
};

export type ProcessSyncJobParams = {
  readonly itemIds: readonly number[];
  readonly scrapeRowCount: number;
  readonly existingCount: number;
  readonly context: ProcessSyncJobContext;
  readonly finalize: (successfulResults: readonly ScrapedItem[]) => Promise<FinalizeSyncResult>;
};

export type ProcessSyncJobResult = {
  readonly processedAt: string;
  readonly scrapeStrategy: "standard" | "rate_limited";
  readonly scrapedItemIds: readonly number[];
  readonly failedItemIds: readonly number[];
  readonly scrapedCount: number;
  readonly failedCount: number;
  readonly successCount: number;
  readonly failCount: number;
  readonly sessionStatus: SyncSessionStatus;
  readonly statusMessage: string;
  readonly persistence: FinalizePersistenceSummary | null;
};

export type ExecuteSyncJobParams = {
  readonly job: FullJobData;
  readonly queueName: string;
  readonly type: string;
  readonly syncSessionId: string;
  readonly userId: string;
  readonly itemIds: readonly number[];
  readonly scrapeRowCount: number;
  readonly existingCount: number;
  readonly orderId: string | null;
  readonly finalize: (
    successfulResults: readonly ScrapedItem[],
    log: WorkerJobLogger,
  ) => Promise<FinalizeSyncResult>;
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

export type WorkerJobContext = {
  readonly action: string;
  readonly outcome: string | null;
  readonly queue: {
    readonly name: string;
    readonly jobName: string;
  };
  readonly job: {
    readonly id: string | null;
    readonly attemptsMade: number;
    readonly attemptNumber: number;
  };
  readonly sync: {
    readonly type: string | null;
    readonly sessionId: string | null;
    readonly jobId: string | null;
    readonly orderId: string | null;
    readonly sessionStatus: string | null;
    readonly statusMessage: string | null;
  };
  readonly user: {
    readonly id: string | null;
  };
  readonly items: {
    readonly requested: number;
    readonly existing: number;
    readonly deduped: number;
    readonly scraped: number;
    readonly failed: number;
    readonly successCount: number;
    readonly failCount: number;
    readonly failedIds: readonly number[];
  };
  readonly scrapeErrors: readonly {
    readonly id: number;
    readonly attemptErrors: readonly string[];
  }[];
  readonly scrape: {
    readonly strategy: string | null;
    readonly maxRetries: number;
    readonly baseDelayMs: number;
    readonly durationMs: number;
    readonly avgPerItemMs: number;
  };
  readonly persistence: {
    readonly items: number;
    readonly itemReleases: number;
    readonly entries: number;
    readonly entryToItems: number;
    readonly collectionItems: number;
    readonly orders: number;
  } | null;
  readonly processedAt: string | null;
  readonly order: {
    readonly id: string | null;
    readonly shop: string | null;
    readonly status: string | null;
  };
  readonly validation: {
    readonly issueCount: number;
  };
};

export type WorkerJobLogger = ReturnType<typeof createLogger<WorkerJobContext>>;
