import { useCallback, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { FileUp, Package, Library } from "lucide-react";
import type { SyncType, SyncSessionStatus, SyncSessionRow } from "@myakiba/types";
import { fetchSyncSessions } from "@/queries/sync";
import { SYNC_OPTION_META } from "@/lib/sync";
import SyncCsvForm from "@/components/sync/sync-csv-form";
import SyncOrderForm from "@/components/sync/sync-order-form";
import SyncCollectionForm from "@/components/sync/sync-collection-form";
import { SyncSessionsDataGrid } from "@/components/sync/sync-sessions-data-grid";
import { syncSearchSchema } from "@myakiba/schemas";
import { useFilters } from "@/hooks/use-filters";
import { Separator } from "@/components/ui/separator";
import { useSyncMutations } from "@/hooks/use-sync-mutations";
import { SYNC_WIDGET_RECENT_LIMIT } from "@myakiba/constants/sync";

const STATUS_FILTER_OPTIONS: readonly {
  readonly value: SyncSessionStatus | "all";
  readonly label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "processing", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "partial", label: "Partial" },
  { value: "pending", label: "Pending" },
] as const;

const SYNC_TYPE_FILTER_OPTIONS: readonly {
  readonly value: SyncType | "all";
  readonly label: string;
}[] = [
  { value: "all", label: "All" },
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
  const statusFilter: SyncSessionStatus | "all" = filters.status ?? "all";
  const syncTypeFilter: SyncType | "all" = filters.syncType ?? "all";
  const [activeSyncType, setActiveSyncType] = useState<SyncType | null>(null);

  const {
    data: sessionsData,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: [
      "syncSessions",
      page,
      limit,
      statusFilter === "all" ? undefined : statusFilter,
      syncTypeFilter === "all" ? undefined : syncTypeFilter,
    ] as const,
    queryFn: () =>
      fetchSyncSessions({
        page,
        limit,
        status: statusFilter === "all" ? undefined : statusFilter,
        syncType: syncTypeFilter === "all" ? undefined : syncTypeFilter,
      }),
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

  const handleStatusFilter = useCallback(
    (status: SyncSessionStatus | "all") => {
      setFilters({
        status: status === "all" ? undefined : status,
        page: undefined,
      });
    },
    [setFilters],
  );

  const handleSyncTypeFilter = useCallback(
    (type: SyncType | "all") => {
      setFilters({
        syncType: type === "all" ? undefined : type,
        page: undefined,
      });
    },
    [setFilters],
  );

  if (isError) {
    return (
      <div className="w-full space-y-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl tracking-tight">Sync</h1>
          <p className="text-muted-foreground text-sm font-light">
            Manage your sync sessions and add items
          </p>
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
          <p className="text-muted-foreground text-sm font-light">
            Manage your sync sessions and add items
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveSyncType("collection")}
            disabled={isSyncing}
          >
            <Library className="size-3.5" />
            Collection
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveSyncType("order")}
            disabled={isSyncing}
          >
            <Package className="size-3.5" />
            Order
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveSyncType("csv")}
            disabled={isSyncing}
          >
            <FileUp className="size-3.5" />
            CSV
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center">
          {SYNC_TYPE_FILTER_OPTIONS.map((option) => (
            <Button
              key={option.value}
              variant={syncTypeFilter === option.value ? "outline" : "dim"}
              size="sm"
              onClick={() => handleSyncTypeFilter(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <Separator orientation="vertical" className="h-4" />
        <div className="flex items-center">
          {STATUS_FILTER_OPTIONS.map((option) => (
            <Button
              key={option.value}
              variant={statusFilter === option.value ? "outline" : "dim"}
              size="sm"
              onClick={() => handleStatusFilter(option.value)}
            >
              {option.label}
            </Button>
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
        <SheetContent side="right" className="sm:max-w-xl overflow-y-auto">
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
