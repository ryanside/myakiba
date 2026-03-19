import { HugeiconsIcon } from "@hugeicons/react";
import { FileUploadIcon, LibraryIcon, PackageIcon } from "@hugeicons/core-free-icons";
import { useCallback, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { SyncType, SyncSessionStatus, SyncSessionRow } from "@myakiba/types";
import { fetchSyncSessions } from "@/queries/sync";
import { SYNC_OPTION_META } from "@/lib/sync";
import SyncCsvForm from "@/components/sync/sync-csv-form";
import SyncOrderForm from "@/components/sync/sync-order-form";
import SyncCollectionForm from "@/components/sync/sync-collection-form";
import { SyncSessionsDataGrid } from "@/components/sync/sync-sessions-data-grid";
import { syncSearchSchema } from "@myakiba/schemas";
import { useFilters } from "@/hooks/use-filters";
import { useSyncMutations } from "@/hooks/use-sync-mutations";
import { SYNC_WIDGET_RECENT_LIMIT } from "@myakiba/constants/sync";

const STATUS_FILTER_OPTIONS: readonly {
  readonly value: SyncSessionStatus;
  readonly label: string;
}[] = [
  { value: "processing", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "partial", label: "Partial" },
  { value: "pending", label: "Pending" },
] as const;

const SYNC_TYPE_FILTER_OPTIONS: readonly {
  readonly value: SyncType;
  readonly label: string;
}[] = [
  { value: "csv", label: "CSV" },
  { value: "order", label: "Order" },
  { value: "collection", label: "Collection" },
] as const;

export const Route = createFileRoute("/(app)/sync")({
  component: RouteComponent,
  validateSearch: syncSearchSchema,
  head: () => ({
    meta: [
      {
        name: "description",
        content: "Manage sync sessions",
      },
      {
        title: "Sync - myakiba",
      },
    ],
  }),
});

function RouteComponent() {
  const { session } = Route.useRouteContext();
  const userCurrency = session?.user.currency || "USD";
  const queryClient = useQueryClient();
  const { filters, setFilters } = useFilters(Route.id, {
    paginationDefaults: { limit: SYNC_WIDGET_RECENT_LIMIT },
  });

  const page = filters.page ?? 1;
  const limit = filters.limit ?? SYNC_WIDGET_RECENT_LIMIT;
  const activeStatuses = useMemo(
    () => new Set<SyncSessionStatus>(filters.status ?? []),
    [filters.status],
  );
  const activeSyncTypes = useMemo(
    () => new Set<SyncType>(filters.syncType ?? []),
    [filters.syncType],
  );
  const [activeSyncType, setActiveSyncType] = useState<SyncType | null>(null);

  const {
    data: sessionsData,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ["syncSessions", page, limit, filters.status, filters.syncType] as const,
    queryFn: () =>
      fetchSyncSessions({
        page,
        limit,
        status: filters.status,
        syncType: filters.syncType,
      }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  const sessions: SyncSessionRow[] = sessionsData?.sessions ?? [];
  const totalCount: number = sessionsData?.total ?? 0;

  const { handleSyncCsvSubmit, handleSyncOrderSubmit, handleSyncCollectionSubmit, isSyncing } =
    useSyncMutations(queryClient, () => {
      setActiveSyncType(null);
    });

  const handlePaginationChange = useCallback(
    (newPage: number, newLimit: number) => {
      setFilters({ page: newPage, limit: newLimit });
    },
    [setFilters],
  );

  const toggleStatus = useCallback(
    (value: SyncSessionStatus) => {
      const next = new Set(activeStatuses);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      setFilters({
        status: next.size > 0 ? [...next] : undefined,
        page: undefined,
      });
    },
    [activeStatuses, setFilters],
  );

  const toggleSyncType = useCallback(
    (value: SyncType) => {
      const next = new Set(activeSyncTypes);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      setFilters({
        syncType: next.size > 0 ? [...next] : undefined,
        page: undefined,
      });
    },
    [activeSyncTypes, setFilters],
  );

  if (isError) {
    return (
      <div className="w-full space-y-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl tracking-tight">Sync</h1>
          <p className="text-muted-foreground text-sm font-normal">View your sync history</p>
        </div>
        <div className="flex flex-col items-center justify-center h-64 gap-y-4">
          <div className="text-lg font-medium text-destructive">Error: {error.message}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl tracking-tight">Sync</h1>
          <p className="text-muted-foreground text-sm font-normal">View your sync history</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground mx-1">Add:</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveSyncType("collection")}
            disabled={isSyncing}
          >
            <HugeiconsIcon icon={LibraryIcon} className="size-3.5 dark:text-primary" />
            Collection
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveSyncType("order")}
            disabled={isSyncing}
          >
            <HugeiconsIcon icon={PackageIcon} className="size-3.5 dark:text-primary" />
            Order
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveSyncType("csv")}
            disabled={isSyncing}
          >
            <HugeiconsIcon icon={FileUploadIcon} className="size-3.5 dark:text-primary" />
            CSV
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row flex-wrap items-start gap-x-4 gap-y-2">
        <div className="flex items-center gap-1" role="group" aria-label="Sync type filters">
          {SYNC_TYPE_FILTER_OPTIONS.map((option) => (
            <Toggle
              key={option.value}
              pressed={activeSyncTypes.has(option.value)}
              onClick={() => toggleSyncType(option.value)}
            >
              {option.label}
            </Toggle>
          ))}
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Status filters">
          {STATUS_FILTER_OPTIONS.map((option) => (
            <Toggle
              key={option.value}
              pressed={activeStatuses.has(option.value)}
              onClick={() => toggleStatus(option.value)}
            >
              {option.label}
            </Toggle>
          ))}
        </div>
      </div>

      <SyncSessionsDataGrid
        sessions={sessions}
        totalCount={totalCount}
        pagination={{ page, limit }}
        onPaginationChange={handlePaginationChange}
        isLoading={isPending}
      />

      <Sheet
        open={activeSyncType !== null}
        onOpenChange={(open) => {
          if (!open) setActiveSyncType(null);
        }}
      >
        <SheetContent side="right" className="sm:max-w-lg! overflow-y-auto">
          {activeSyncType && (
            <>
              <SheetHeader>
                <SheetTitle>{SYNC_OPTION_META[activeSyncType].title}</SheetTitle>
                <SheetDescription>{SYNC_OPTION_META[activeSyncType].description}</SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-4">
                {activeSyncType === "csv" && (
                  <SyncCsvForm handleSyncCsvSubmit={handleSyncCsvSubmit} />
                )}
                {activeSyncType === "order" && (
                  <SyncOrderForm
                    handleSyncOrderSubmit={handleSyncOrderSubmit}
                    currency={userCurrency}
                  />
                )}
                {activeSyncType === "collection" && (
                  <SyncCollectionForm
                    handleSyncCollectionSubmit={handleSyncCollectionSubmit}
                    currency={userCurrency}
                  />
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
