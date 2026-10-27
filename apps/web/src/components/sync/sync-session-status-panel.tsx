import { useId } from "react";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { EnrichedSyncSessionItemRow, SyncSessionDetail } from "@myakiba/contracts/sync/types";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useSyncJobStatusQuery } from "@/hooks/use-sync-job-status-query";
import { resolveSyncMessage } from "@/lib/sync";
import type { PriceWarning } from "@/lib/sync";
import { cn } from "@/lib/utils";

export function SyncSessionStatusPanel({
  session,
  items,
  isActive,
  isLoading,
}: {
  readonly session:
    | Pick<
        SyncSessionDetail,
        | "id"
        | "jobId"
        | "syncType"
        | "statusMessage"
        | "totalItems"
        | "successCount"
        | "failCount"
        | "warnings"
      >
    | undefined;
  /** The session's loaded items, which name the items its price warnings point at. */
  readonly items: readonly Pick<EnrichedSyncSessionItemRow, "itemExternalId" | "itemTitle">[];
  readonly isActive: boolean;
  readonly isLoading: boolean;
}): ReactNode {
  const { data: jobStatus, isError: isJobError } = useSyncJobStatusQuery(
    isActive && session ? session.jobId : null,
    session?.id ?? null,
    session?.syncType ?? null,
  );

  if (isLoading) {
    return (
      <div className="space-y-2" aria-busy="true">
        <div className="flex items-center gap-2">
          <Skeleton className="size-2 shrink-0 rounded-full" />
          <div className="flex items-center gap-1 text-sm">
            Status: <Skeleton className="h-4 w-44 max-w-[60vw]" />
          </div>
        </div>
        <div className="space-y-1">
          <Skeleton className="h-1 w-full rounded-full" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Skeleton className="h-3 w-5" /> of <Skeleton className="h-3 w-5" />
            </div>
            <div className="flex items-center gap-0.5">
              <Skeleton className="h-3 w-6" />%
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!session) return null;

  const isLive = isActive && jobStatus?.terminalState == null;
  const isStreamError = isLive && (isJobError || !jobStatus);
  const message = resolveSyncMessage(session, isLive ? (jobStatus ?? null) : null, isStreamError);

  const warningsList =
    session.warnings.length > 0 ? (
      <PriceWarnings warnings={session.warnings} items={items} />
    ) : null;

  if (!message) return warningsList;

  // `progress.processed` counts succeeded + failed, so the DB fallback must too
  // — otherwise the bar jumps forward on stream disconnect.
  const liveProgress = isLive ? (jobStatus?.progress ?? null) : null;
  const displayedProcessed = liveProgress?.processed ?? session.successCount + session.failCount;
  const displayedTotal = liveProgress?.total ?? session.totalItems;
  const percent = displayedTotal > 0 ? Math.round((displayedProcessed / displayedTotal) * 100) : 0;

  return (
    <>
      <output className="block space-y-2" aria-live={isLive ? "polite" : "off"}>
        <div className="flex items-start gap-2">
          {isLive ? (
            <span
              aria-hidden="true"
              className="relative mt-1.5 size-2 shrink-0 rounded-full bg-foreground"
            >
              <span className="absolute inset-0 rounded-full bg-foreground motion-safe:animate-ping" />
            </span>
          ) : (
            <span
              aria-hidden
              className="mt-1.5 size-2 shrink-0 rounded-full bg-muted-foreground/50"
            />
          )}
          <p className={cn("min-w-0 text-sm", isStreamError && "text-destructive")}>
            Status: <span className="animate-data-in">{message}</span>
          </p>
        </div>

        <div className="space-y-1">
          <Progress
            value={displayedProcessed}
            max={displayedTotal || 1}
            className="animate-data-in h-1"
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
            <span>
              <span className="animate-data-in inline-block">{displayedProcessed}</span> of{" "}
              <span className="animate-data-in inline-block">{displayedTotal}</span>
            </span>
            <span>
              <span className="animate-data-in inline-block">{percent}</span>%
            </span>
          </div>
        </div>
      </output>
      {warningsList}
    </>
  );
}

function PriceWarnings({
  warnings,
  items,
}: {
  readonly warnings: readonly PriceWarning[];
  readonly items: readonly Pick<EnrichedSyncSessionItemRow, "itemExternalId" | "itemTitle">[];
}): ReactNode {
  const headingId = useId();
  const titles = new Map(
    items.flatMap((item) => (item.itemTitle ? [[item.itemExternalId, item.itemTitle]] : [])),
  );
  return (
    <section aria-labelledby={headingId} className="space-y-2 rounded-lg border p-3">
      <div className="space-y-0.5">
        <h2 id={headingId} className="text-sm font-medium">
          Prices we couldn&rsquo;t read
        </h2>
        <p className="text-xs text-muted-foreground">
          These items were saved without a price. Open each one to enter it.
        </p>
      </div>
      <ul className="space-y-1.5 text-sm">
        {warnings.map(({ mfcItemId, input }, index) => {
          const title = titles.get(mfcItemId);
          return (
            <li
              key={`${mfcItemId}-${index}`}
              className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
            >
              <Link
                to="/item/$externalId"
                params={{ externalId: mfcItemId }}
                className="font-medium text-foreground hover:underline"
              >
                {title ?? `MFC #${mfcItemId}`}
              </Link>
              {title ? (
                <span className="text-xs text-muted-foreground">MFC #{mfcItemId}</span>
              ) : null}
              <span className="text-xs text-muted-foreground">
                Price in the CSV: <code className="font-mono text-foreground">{input}</code>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
