import { useCallback } from "react";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import type { SyncSessionRow } from "@myakiba/contracts/sync/types";
import { useRead } from "@/data/client";
import { sync } from "@/data/resources/sync";
import { SyncSessionsDataGrid } from "@/components/sync/sync-sessions-data-grid";
import { SyncQuickFilters } from "@/components/sync/sync-quick-filters";
import { syncSearchSchema } from "@myakiba/contracts/sync/schema";
import { useFilters } from "@/hooks/use-filters";
import { SYNC_WIDGET_RECENT_LIMIT } from "@myakiba/contracts/sync/constants";

export const Route = createFileRoute("/(app)/sync")({
  component: RouteComponent,
  validateSearch: syncSearchSchema,
  search: {
    middlewares: [stripSearchParams({ page: 1, limit: SYNC_WIDGET_RECENT_LIMIT })],
  },
  head: () => ({
    meta: [
      {
        name: "description",
        content: "View your imports",
      },
      {
        title: "Import history - myakiba",
      },
    ],
  }),
});

function RouteComponent() {
  const { filters, setFilters } = useFilters(Route.id);

  const page = filters.page ?? 1;
  const limit = filters.limit ?? SYNC_WIDGET_RECENT_LIMIT;

  const {
    data: sessionsData,
    isPending,
    isError,
    error,
  } = useRead(sync.sessions, {
    page,
    limit,
    status: filters.status,
    syncType: filters.syncType,
  });

  const sessions: SyncSessionRow[] = sessionsData?.sessions ?? [];
  const totalCount: number = sessionsData?.total ?? 0;

  const handlePaginationChange = useCallback(
    (newPage: number, newLimit: number) => {
      setFilters({ page: newPage, limit: newLimit });
    },
    [setFilters],
  );

  if (isError) {
    return (
      <div className="flex flex-col gap-4 mx-auto max-w-[88rem]">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl tracking-tight">Import history</h1>
        </div>
        <div className="flex flex-col items-center justify-center h-64 gap-y-4">
          <div className="text-lg font-medium text-destructive">Error: {error.message}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 mx-auto max-w-[88rem]">
      <div className="mb-2 flex flex-col gap-2">
        <h1 className="text-2xl font-medium tracking-tight">Import history</h1>
        <p className="text-sm text-muted-foreground">
          Import history is automatically deleted after 30 days.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row flex-wrap items-start gap-x-4 gap-y-2">
        <SyncQuickFilters />
      </div>

      <SyncSessionsDataGrid
        sessions={sessions}
        totalCount={totalCount}
        pagination={{ page, limit }}
        onPaginationChange={handlePaginationChange}
        isLoading={isPending}
      />
    </div>
  );
}
