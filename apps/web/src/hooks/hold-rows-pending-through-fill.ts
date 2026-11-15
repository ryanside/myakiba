import type { Dispatch, SetStateAction } from "react";
import { toast } from "@/components/ui/toast";
import type { Saving } from "@/data/client";

export async function holdRowsPendingThroughFill(
  title: string,
  ids: ReadonlySet<string>,
  setPending: Dispatch<SetStateAction<readonly string[]>>,
  fill: () => Saving,
): Saving {
  const loadingToastId = toast.add({ type: "loading", title, timeout: 0 });
  setPending((previous) => [...new Set([...previous, ...ids])]);

  const saved = await fill();
  toast.close(loadingToastId);
  setPending((previous) => previous.filter((id) => !ids.has(id)));
  return saved;
}
