import type { DrainContext } from "evlog";
import { createPostHogDrain } from "evlog/posthog";
import { createDrainPipeline } from "evlog/pipeline";
import { env } from "@myakiba/env/worker";

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
