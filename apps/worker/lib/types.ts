import type { Job } from "bullmq";
import type Redis from "ioredis";
import type { createLogger } from "evlog";
import type {
  JobData,
  NormalizedInternalCsvItem,
  UpdatedSyncOrder,
  UpdatedSyncOrderItem,
  UpdatedSyncCollection,
  SyncJobPhase,
  SyncJobProgress,
  SyncJobRecentItem,
  SyncJobError,
  SyncTerminalState,
  QueuedCollectionItem,
} from "@myakiba/contracts/sync/schema";
import type { SyncSessionStatus, SyncType, Category } from "@myakiba/contracts/shared/types";

export type ScrapeFailure = {
  readonly id: number;
  readonly reason: string;
  readonly attemptErrors: readonly string[];
};

export type SyncSessionItemFailure = {
  readonly id: number;
  readonly errorReason: string;
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

export type SyncJobStatusState = {
  readonly jobId: string;
  readonly startedAt: string;
  readonly rowCountByExternalId?: ReadonlyMap<number, number>;
  phase: SyncJobPhase;
  progress: SyncJobProgress | null;
  recentItems: readonly SyncJobRecentItem[];
  statusMessage: string;
};

export type PublishJobStatusParams = {
  readonly redis: Redis;
  readonly state: SyncJobStatusState;
  readonly terminalState: SyncTerminalState | null;
  readonly error: SyncJobError | null;
  readonly syncSessionId?: string;
  readonly sessionStatus?: "processing";
};

export type ScrapeImageParams = {
  readonly imageUrl: string;
  readonly log: WorkerJobLogger;
  readonly maxRetries?: number;
  readonly baseDelayMs?: number;
};

export type ScrapeSingleItemParams = {
  readonly id: number;
  readonly log: WorkerJobLogger;
  readonly maxRetries?: number;
  readonly baseDelayMs?: number;
  readonly progressStatusMessage?: string;
  /**
   * Pass both `redis` and `state` so `scrapeSingleItem` sends a `SyncJobStatus`
   * update after each item succeeds or fails. Single-item resync jobs omit both
   * when no one is listening for live updates.
   */
  readonly redis?: Redis;
  readonly state?: SyncJobStatusState;
};

export type ScrapeItemsParams = {
  readonly itemIds: readonly number[];
  readonly redis: Redis;
  readonly state: SyncJobStatusState;
  readonly log: WorkerJobLogger;
  readonly maxRetries?: number;
  readonly baseDelayMs?: number;
  readonly progressStatusMessage?: string;
};

export type FinalizeCollectionSyncParams = {
  readonly successfulResults: readonly ScrapedItem[];
  readonly failures: readonly SyncSessionItemFailure[];
  readonly log: WorkerJobLogger;
  readonly redis: Redis;
  readonly state: SyncJobStatusState;
  readonly itemsToScrape: UpdatedSyncCollection[];
  readonly itemsToInsert: QueuedCollectionItem[];
  readonly initialSuccessCount: number;
  readonly syncSessionId: string;
};

export type FinalizeOrderSyncParams = {
  readonly successfulResults: readonly ScrapedItem[];
  readonly failures: readonly SyncSessionItemFailure[];
  readonly log: WorkerJobLogger;
  readonly redis: Redis;
  readonly state: SyncJobStatusState;
  readonly details: UpdatedSyncOrder;
  readonly itemsToScrape: UpdatedSyncOrderItem[];
  readonly itemsToInsert: QueuedCollectionItem[];
  readonly initialSuccessCount: number;
  readonly syncSessionId: string;
  readonly createOrder: boolean;
};

export type FinalizeCsvSyncParams = {
  readonly successfulResults: readonly ScrapedItem[];
  readonly failures: readonly SyncSessionItemFailure[];
  readonly log: WorkerJobLogger;
  readonly userId: string;
  readonly redis: Redis;
  readonly state: SyncJobStatusState;
  readonly csvItems: NormalizedInternalCsvItem[];
  readonly itemsToInsert: QueuedCollectionItem[];
  readonly ordersToInsert: UpdatedSyncOrder[];
  readonly initialSuccessCount: number;
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
  readonly initialSuccessCount: number;
  readonly context: ProcessSyncJobContext;
  readonly finalize: (
    successfulResults: readonly ScrapedItem[],
    failures: readonly SyncSessionItemFailure[],
    state: SyncJobStatusState,
  ) => Promise<FinalizeSyncResult>;
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
  readonly persistence: FinalizePersistenceSummary;
};

export type ExecuteSyncJobParams = {
  readonly job: FullJobData;
  readonly type: SyncType;
  readonly syncSessionId: string;
  readonly userId: string;
  readonly itemIds: readonly number[];
  readonly initialSuccessCount: number;
  readonly orderId: string | null;
  readonly finalize: (
    successfulResults: readonly ScrapedItem[],
    failures: readonly SyncSessionItemFailure[],
    state: SyncJobStatusState,
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
  readonly deployment: {
    readonly version: string;
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
