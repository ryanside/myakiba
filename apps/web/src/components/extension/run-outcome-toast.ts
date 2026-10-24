import { toast } from "@/components/ui/toast";
import type { RunOutcome } from "@/data/extension-run";
import { asPanic } from "@/lib/as-panic";

/** Where an extension run's crash ends: it is reported as a defect, and the user sees one generic toast. */
async function toastIfStopped(running: Promise<RunOutcome>): Promise<void> {
  let outcome: RunOutcome;
  try {
    outcome = await running;
  } catch (error) {
    console.error(asPanic(error));
    toast.add({
      type: "error",
      title: "The import stopped unexpectedly",
      description: "Reload the page to see which items were imported.",
    });
    return;
  }
  if (outcome.kind !== "busy") return;
  const { notImported, retryAfterMs } = outcome;
  const minutes = retryAfterMs === null ? null : Math.max(1, Math.ceil(retryAfterMs / 60_000));
  toast.add({
    type: "error",
    title: "You've reached the hourly import limit",
    description: `${notImported} item${notImported === 1 ? " was" : "s were"} not imported. ${
      minutes === null ? "Try again later." : `Try again in ${minutes} min.`
    }`,
  });
}

export function toastRunOutcome(running: Promise<RunOutcome>): void {
  void toastIfStopped(running);
}
