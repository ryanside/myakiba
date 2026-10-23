import { toast } from "@/components/ui/toast";
import type { RunOutcome } from "@/data/extension-run";

export async function toastImportLimit(running: Promise<RunOutcome>): Promise<void> {
  const outcome = await running;
  if (outcome.kind !== "busy") return;
  const { notImported, retryAfterMs } = outcome;
  const minutes = retryAfterMs === null ? null : Math.max(1, Math.ceil(retryAfterMs / 60_000));
  toast.add({
    type: "error",
    title: "myakiba is busy",
    description: `${notImported} item${notImported === 1 ? " was" : "s were"} not imported. ${
      minutes === null ? "Retry them later." : `Retry them in about ${minutes} min.`
    }`,
  });
}
