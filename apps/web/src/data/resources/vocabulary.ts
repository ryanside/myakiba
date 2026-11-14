import { app } from "@/lib/treaty-client";
import { call } from "../api";
import { rootedRead } from "../client";

export const vocabulary = rootedRead("vocabulary", {
  key: () => ["vocabulary"] as const,
  load: () =>
    call(app.api.vocabulary.get(), {
      fallback: "Failed to load your shops",
      empty: "Failed to load your shops",
    }),
  staleTime: 1000 * 60 * 5,
  retry: false,
});
