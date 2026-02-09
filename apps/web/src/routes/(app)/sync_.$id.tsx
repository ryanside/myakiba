import { useMemo, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  experimental_streamedQuery as streamedQuery,
} from "@tanstack/react-query";
import { getCoreRowModel, type PaginationState, useReactTable } from "@tanstack/react-table";
import { DataGrid, DataGridContainer } from "@/components/ui/data-grid";
import { DataGridPagination } from "@/components/ui/data-grid-pagination";
import { DataGridTable } from "@/components/ui/data-grid-table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { EnrichedSyncSessionItemRow, SyncSessionStatus, SyncType } from "@myakiba/types";
import { fetchSyncSessionDetail, retrySyncFailedItems } from "@/queries/sync";
import { createSyncSessionItemSubColumns } from "@/components/sync/sync-session-item-sub-columns";
import { SESSION_STATUS_CONFIG, SYNC_TYPE_CONFIG } from "@/lib/sync";
import { formatDateTime, formatDuration } from "@myakiba/utils/dates";
import { app } from "@/lib/treaty-client";
import Loader from "@/components/loader";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

const ITEMS_PAGE_SIZE = 10;

const ACTIVE_STATUSES: ReadonlySet<SyncSessionStatus> = new Set(["pending", "processing"]);

type JobStatusEvent = {
  readonly status: string;
  readonly finished: boolean;
  readonly createdAt: string;
};

type SSEJobStatusChunk = {
  readonly data: JobStatusEvent;
};

export const Route = createFileRoute("/(app)/sync_/$id")({
  component: RouteComponent,
  head: ({ params }) => ({
    meta: [
      { name: "description", content: `Sync session ${params.id}` },
      { title: "Sync Session - myakiba" },
    ],
  }),
});

function LiveStatusBanner({
  jobId,
  sessionId,
}: {
  readonly jobId: string;
  readonly sessionId: string;
}) {
  const queryClient = useQueryClient();

  const { data: jobStatus, isError: isJobError } = useQuery({
    queryKey: ["syncJobStatus", jobId] as const,
    queryFn: streamedQuery({
      streamFn: async ({ signal }) => {
        const { data, error } = await app.api.sync["job-status"].get({
          query: { jobId },
          fetch: { signal },
        });
        if (error) throw new Error("Failed to connect to job status stream");
        if (!data) throw new Error("No data received from job status stream");

        const stream = data as unknown as AsyncIterable<SSEJobStatusChunk>;

        async function* withFinishedCheck(): AsyncGenerator<SSEJobStatusChunk> {
          for await (const chunk of stream) {
            yield chunk;
            if (chunk.data.finished) {
              void queryClient.invalidateQueries({
                queryKey: ["syncSessions"],
              });
              void queryClient.invalidateQueries({
                queryKey: ["syncSessionDetail", sessionId],
              });
            }
          }
        }

        return withFinishedCheck();
      },
      reducer: (_prev: JobStatusEvent, chunk: SSEJobStatusChunk) => chunk.data,
      initialValue: { status: "Connecting...", finished: false, createdAt: "" },
    }),
    refetchOnWindowFocus: false,
    retry: false,
  });

  const isFinished = jobStatus?.finished === true;
  const displayStatus = isJobError ? "Stream error" : (jobStatus?.status ?? "Connecting...");

  if (isFinished) return null;

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
      {!isJobError && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}
      <p className="text-sm text-muted-foreground">{displayStatus}</p>
    </div>
  );
}

function RouteComponent() {
  const { id } = useParams({ from: "/(app)/sync_/$id" });
  const queryClient = useQueryClient();

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: ITEMS_PAGE_SIZE,
  });
  const page = pagination.pageIndex + 1;

  const {
    data: responseData,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ["syncSessionDetail", id, page, ITEMS_PAGE_SIZE] as const,
    queryFn: () => fetchSyncSessionDetail(id, { page, limit: ITEMS_PAGE_SIZE }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  const session = responseData?.session;
  const items: EnrichedSyncSessionItemRow[] =
    session && "items" in session ? (session.items as EnrichedSyncSessionItemRow[]) : [];
  const totalItems: number =
    responseData && "totalItems" in responseData ? (responseData.totalItems as number) : 0;

  const sessionStatus = (session?.status ?? "pending") as SyncSessionStatus;
  const sessionSyncType = (session?.syncType ?? "csv") as SyncType;
  const isActive = session ? ACTIVE_STATUSES.has(sessionStatus) : false;
  const isRetryable =
    (sessionStatus === "failed" || sessionStatus === "partial") && (session?.failCount ?? 0) > 0;

  const retryMutation = useMutation({
    mutationFn: () => retrySyncFailedItems(id),
    onSuccess: (data) => {
      toast.success(`Retrying ${data.itemCount} failed items...`);
      void queryClient.invalidateQueries({ queryKey: ["syncSessions"] });
      void queryClient.invalidateQueries({
        queryKey: ["syncSessionDetail", id],
      });
    },
    onError: (err: Error) => {
      toast.error("Failed to retry.", { description: err.message });
    },
  });

  const columns = useMemo(() => createSyncSessionItemSubColumns(), []);

  const table = useReactTable({
    columns,
    data: items,
    pageCount: Math.max(1, Math.ceil(totalItems / ITEMS_PAGE_SIZE)),
    state: { pagination },
    onPaginationChange: setPagination,
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row: EnrichedSyncSessionItemRow) => row.id,
  });

  if (isPending) return <Loader />;

  if (isError) {
    return (
      <div className="w-full space-y-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl tracking-tight">Sync Session</h1>
        </div>
        <div className="flex flex-col items-center justify-center h-64 gap-y-4">
          <p className="text-lg font-medium text-destructive">Error: {error.message}</p>
          <Button asChild variant="outline">
            <Link to="/sync">
              <ArrowLeft className="size-4" />
              Back to Sync
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-y-4">
        <p className="text-lg font-medium text-muted-foreground">Session not found</p>
        <Button asChild variant="outline">
          <Link to="/sync">
            <ArrowLeft className="size-4" />
            Back to Sync
          </Link>
        </Button>
      </div>
    );
  }

  const statusConfig = SESSION_STATUS_CONFIG[sessionStatus];
  const typeConfig = SYNC_TYPE_CONFIG[sessionSyncType];

  return (
    <div className="w-full space-y-8">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2 text-muted-foreground">
          <Link to="/sync">
            <ArrowLeft className="size-3.5" />
            Back to Sync
          </Link>
        </Button>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl tracking-tight">{typeConfig.label} Sync</h1>
              <Badge variant={statusConfig.variant} appearance="light" size="sm">
                {statusConfig.label}
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm font-light">
              Started {formatDateTime(session.createdAt)}
            </p>
          </div>

          {isRetryable && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => retryMutation.mutate()}
              disabled={retryMutation.isPending}
            >
              {retryMutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RotateCcw className="size-3.5" />
              )}
              Retry failed ({session.failCount})
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground font-light">Total Items</span>
          <span className="text-2xl font-semibold tabular-nums tracking-tight">
            {session.totalItems}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground font-light">Succeeded</span>
          <span className="text-2xl font-semibold tabular-nums tracking-tight">
            {session.successCount}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground font-light">Failed</span>
          <span
            className={cn(
              "text-2xl font-semibold tabular-nums tracking-tight",
              session.failCount > 0 && "text-destructive",
            )}
          >
            {session.failCount}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground font-light">Duration</span>
          <span className="text-2xl font-semibold tabular-nums tracking-tight">
            {formatDuration(session.createdAt, session.completedAt)}
          </span>
        </div>
      </div>

      {isActive && session.jobId && <LiveStatusBanner jobId={session.jobId} sessionId={id} />}

      {!isActive && session.statusMessage && (
        <div className="rounded-lg flex items-center gap-2">
          <Separator orientation="vertical" className="h-4 inline-block" />
          <p className="text-sm">Status: {session.statusMessage}</p>
        </div>
      )}

      <DataGrid
        table={table}
        recordCount={totalItems}
        isLoading={isPending}
        loadingMode="skeleton"
        tableLayout={{
          rowBorder: true,
          headerBackground: true,
          headerBorder: true,
        }}
      >
        <div className="w-full space-y-2.5">
          <DataGridContainer>
            <ScrollArea>
              <DataGridTable />
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </DataGridContainer>
          <div className="flex items-center justify-end">
            <DataGridPagination />
          </div>
        </div>
      </DataGrid>
    </div>
  );
}
