import type { ReactNode } from "react";
import { useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PaginationState } from "@tanstack/react-table";
import { SYNC_SESSION_ITEM_STATUSES } from "@myakiba/contracts/shared/constants";
import type { SyncSessionItemStatus } from "@myakiba/contracts/shared/types";
import {
  ACTIVE_SYNC_SESSION_STATUS_SET,
  SYNC_SESSION_DETAIL_PAGE_SIZE,
  SYNC_SESSION_RETRY_WINDOW_DAYS,
  SYNC_SESSION_RETENTION_DAYS,
} from "@myakiba/contracts/sync/constants";
import { syncSessionDetailSearchSchema } from "@myakiba/contracts/sync/schema";
import { SyncSessionHero } from "@/components/sync/sync-session-hero";
import { SyncSessionItemsTable } from "@/components/sync/sync-session-items-table";
import { SyncSessionStatusPanel } from "@/components/sync/sync-session-status-panel";
import { BackLink } from "@/components/ui/back-link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fetchSyncSessionDetail, retrySyncSession } from "@/queries/sync";
import { ITEM_STATUS_CONFIG } from "@/lib/sync";
import { cn } from "@/lib/utils";
import { useFilters } from "@/hooks/use-filters";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "@/components/ui/toast";
import { HugeiconsIcon } from "@hugeicons/react";
import { RedoIcon } from "@hugeicons/core-free-icons";

const VALID_ITEM_STATUSES: ReadonlySet<string> = new Set(SYNC_SESSION_ITEM_STATUSES);

export const Route = createFileRoute("/(app)/sync_/$id")({
  component: RouteComponent,
  validateSearch: syncSessionDetailSearchSchema,
  head: ({ params }) => ({
    meta: [
      { name: "description", content: `Import ${params.id}` },
      { title: "Import details - myakiba" },
    ],
  }),
});

function RouteComponent(): ReactNode {
  const { id } = useParams({ from: "/(app)/sync_/$id" });
  const { filters, setFilters } = useFilters(Route.id);

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: SYNC_SESSION_DETAIL_PAGE_SIZE,
  });
  const page = pagination.pageIndex + 1;
  const selectedStatuses = filters.status ?? [];

  const handleStatusChange = (values: string[]): void => {
    const statuses = values.filter((value): value is SyncSessionItemStatus =>
      VALID_ITEM_STATUSES.has(value),
    );

    setPagination((current) => ({ ...current, pageIndex: 0 }));
    setFilters({ status: statuses.length > 0 ? statuses : undefined });
  };

  const {
    data: responseData,
    isPending,
    isFetching,
    isError,
    error,
  } = useQuery({
    queryKey: [
      "syncSessionDetail",
      id,
      page,
      SYNC_SESSION_DETAIL_PAGE_SIZE,
      selectedStatuses,
    ] as const,
    queryFn: () =>
      fetchSyncSessionDetail(id, {
        page,
        limit: SYNC_SESSION_DETAIL_PAGE_SIZE,
        status: filters.status,
      }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  const session = responseData?.session;
  const items = session?.items ?? [];
  const totalItems = responseData?.totalItems ?? 0;

  return (
    <div className="flex flex-col gap-4 mx-auto max-w-352" aria-busy={isPending} aria-live="polite">
      {isPending ? <span className="sr-only">Loading import details</span> : null}
      <BackLink fallbackTo="/sync" text="Back" font="sans" className="self-start" />

      {isError ? (
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-medium tracking-tight">Import details</h1>
          <p className="animate-data-in text-sm font-normal text-destructive">
            Error: {error.message}
          </p>
        </div>
      ) : null}

      {!isPending && !isError && !session ? (
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-medium tracking-tight">Import details</h1>
          <p className="text-muted-foreground text-sm font-normal">Import not found</p>
        </div>
      ) : null}

      {!isError && (isPending || session) ? (
        <>
          <SyncSessionHero session={session} isLoading={isPending} />

          <p className="text-sm text-muted-foreground">
            Import history is automatically deleted after {SYNC_SESSION_RETENTION_DAYS} days. Failed
            item results can be retried for {SYNC_SESSION_RETRY_WINDOW_DAYS} days.
          </p>

          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
            {[
              { label: "Total Items", value: session?.totalItems },
              { label: "Succeeded", value: session?.successCount },
              {
                label: "Failed",
                value: session?.failCount,
                isError: (session?.failCount ?? 0) > 0,
              },
            ].map(({ label, value, isError: isStatError }) => (
              <div key={label} className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground font-normal">{label}</span>
                {isPending ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <span
                    className={cn(
                      "animate-data-in text-2xl font-normal tabular-nums tracking-tight",
                      isStatError && "text-destructive",
                    )}
                  >
                    {value}
                  </span>
                )}
              </div>
            ))}
          </div>

          <SyncSessionStatusPanel
            session={session}
            isLoading={isPending}
            isActive={session ? ACTIVE_SYNC_SESSION_STATUS_SET.has(session.status) : false}
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <ToggleGroup
              value={selectedStatuses}
              onValueChange={handleStatusChange}
              multiple
              size="sm"
              variant="outline"
              aria-label="Item status"
            >
              {SYNC_SESSION_ITEM_STATUSES.map((status) => (
                <ToggleGroupItem key={status} value={status}>
                  {ITEM_STATUS_CONFIG[status].label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {session ? (
              <RetrySyncSessionButton
                sessionId={id}
                retrySupported={session.retrySupported}
                canRetry={session.canRetry}
                isRetrying={session.isRetrying}
                failCount={session.failCount}
              />
            ) : null}
          </div>

          <SyncSessionItemsTable
            items={items}
            totalItems={totalItems}
            isLoading={isFetching}
            isFiltered={selectedStatuses.length > 0}
            pagination={pagination}
            onPaginationChange={setPagination}
          />
        </>
      ) : null}
    </div>
  );
}

function RetrySyncSessionButton({
  sessionId,
  retrySupported,
  canRetry,
  isRetrying,
  failCount,
}: {
  readonly sessionId: string;
  readonly retrySupported: boolean;
  readonly canRetry: boolean;
  readonly isRetrying: boolean;
  readonly failCount: number;
}): ReactNode {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => retrySyncSession(sessionId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["syncSessionDetail", sessionId] }),
        queryClient.invalidateQueries({ queryKey: ["syncSessions"] }),
      ]);
    },
    onError: (retryError) => {
      toast.add({
        type: "error",
        title: "Failed to retry failed item results",
        description: retryError.message,
      });
    },
  });
  const retryIsPending = mutation.isPending || isRetrying;
  let unavailableReason: string | null = null;
  if (!retrySupported) {
    unavailableReason = "This import was created before failed item retries were supported.";
  } else if (failCount === 0) {
    unavailableReason = "This import has no failed item results to retry.";
  } else if (!canRetry) {
    unavailableReason = "Retry is not available for this import.";
  }

  const button = (
    <Button
      type="button"
      size="sm"
      className="gap-1"
      disabled={!canRetry || retryIsPending}
      onClick={() => mutation.mutate()}
    >
      <HugeiconsIcon
        icon={RedoIcon}
        data-icon="inline-start"
        className={retryIsPending ? "animate-spin" : ""}
      />
      <span>
        {retryIsPending ? "Retrying failed item results..." : "Retry failed item results"}
      </span>
    </Button>
  );

  if (!unavailableReason || retryIsPending) return button;

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex cursor-default">{button}</span>} />
      <TooltipContent>{unavailableReason}</TooltipContent>
    </Tooltip>
  );
}
