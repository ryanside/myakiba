import type { DrainContext } from "evlog";
import { createPostHogDrain } from "evlog/posthog";
import { createDrainPipeline } from "evlog/pipeline";
import { env } from "@myakiba/env/worker";
import type { WorkerJobContext } from "./types";

const pipeline = createDrainPipeline<DrainContext>({
  batch: { size: 50, intervalMs: 5000 },
  retry: { maxAttempts: 3 },
});

export const drain = env.POSTHOG_API_KEY
  ? pipeline(
      createPostHogDrain({
        apiKey: env.POSTHOG_API_KEY,
      }),
    )
  : undefined;

export function createDefaultJobContext(): WorkerJobContext {
  return {
    action: "sync.job",
    outcome: null,
    queue: { name: "", jobName: "" },
    job: { id: null, attemptsMade: 0, attemptNumber: 0 },
    sync: {
      type: null,
      sessionId: null,
      jobId: null,
      orderId: null,
      sessionStatus: null,
      statusMessage: null,
    },
    user: { id: null },
    items: {
      requested: 0,
      existing: 0,
      deduped: 0,
      scraped: 0,
      failed: 0,
      successCount: 0,
      failCount: 0,
      failedIds: [],
    },
    scrapeErrors: [],
    scrape: { strategy: null, maxRetries: 0, baseDelayMs: 0, durationMs: 0, avgPerItemMs: 0 },
    persistence: null,
    processedAt: null,
    order: { id: null, shop: null, status: null },
    validation: { issueCount: 0 },
  };
}
