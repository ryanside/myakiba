import type { ReactNode } from "react";
import { useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { PaginationState } from "@tanstack/react-table";
import {
  ACTIVE_SYNC_SESSION_STATUS_SET,
  SYNC_SESSION_DETAIL_PAGE_SIZE,
} from "@myakiba/contracts/sync/constants";
import { SyncSessionHero } from "@/components/sync/sync-session-hero";
import { SyncSessionItemsTable } from "@/components/sync/sync-session-items-table";
import { SyncSessionStatusPanel } from "@/components/sync/sync-session-status-panel";
import { BackLink } from "@/components/ui/back-link";
import { Skeleton } from "@/components/ui/skeleton";
import { formatSyncDuration } from "@/lib/date-display";
import { fetchSyncSessionDetail } from "@/queries/sync";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/(app)/sync_/$id")({
  component: RouteComponent,
  head: ({ params }) => ({
    meta: [
      { name: "description", content: `Sync session ${params.id}` },
      { title: "Sync Session - myakiba" },
    ],
  }),
});

function RouteComponent(): ReactNode {
  const { id } = useParams({ from: "/(app)/sync_/$id" });

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: SYNC_SESSION_DETAIL_PAGE_SIZE,
  });
  const page = pagination.pageIndex + 1;

  const {
    data: responseData,
    isPending,
    isFetching,
    isError,
    error,
  } = useQuery({
    queryKey: ["syncSessionDetail", id, page, SYNC_SESSION_DETAIL_PAGE_SIZE] as const,
    queryFn: () => fetchSyncSessionDetail(id, { page, limit: SYNC_SESSION_DETAIL_PAGE_SIZE }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  const session = responseData?.session;
  const items = session?.items ?? [];
  const totalItems = responseData?.totalItems ?? 0;

  return (
    <div className="flex flex-col gap-4 mx-auto max-w-352" aria-busy={isPending} aria-live="polite">
      {isPending ? <span className="sr-only">Loading sync session details</span> : null}
      <BackLink to="/sync" text="Back" font="sans" className="self-start" />

      {isError ? (
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-medium tracking-tight">Sync Session</h1>
          <p className="animate-data-in text-sm font-normal text-destructive">
            Error: {error.message}
          </p>
        </div>
      ) : null}

      {!isPending && !isError && !session ? (
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-medium tracking-tight">Sync Session</h1>
          <p className="text-muted-foreground text-sm font-normal">Session not found</p>
        </div>
      ) : null}

      {!isError && (isPending || session) ? (
        <>
          <SyncSessionHero session={session} isLoading={isPending} />

          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {[
              { label: "Total Items", value: session?.totalItems },
              { label: "Succeeded", value: session?.successCount },
              {
                label: "Failed",
                value: session?.failCount,
                isError: (session?.failCount ?? 0) > 0,
              },
              {
                label: "Duration",
                value: session
                  ? formatSyncDuration(session.createdAt, session.completedAt)
                  : undefined,
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

          <SyncSessionItemsTable
            items={items}
            totalItems={totalItems}
            isLoading={isFetching}
            pagination={pagination}
            onPaginationChange={setPagination}
          />
        </>
      ) : null}
    </div>
  );
}
