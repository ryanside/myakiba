import type { ReactNode } from "react";
import type { SyncSessionRow } from "@myakiba/contracts/sync/types";
import { ThemedBadge } from "@/components/reui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SESSION_STATUS_CONFIG, SYNC_TYPE_CONFIG } from "@/lib/sync";
import { formatShortDateTime } from "@/lib/date-display";

export function SyncSessionHero({
  session,
  isLoading,
}: {
  readonly session: Pick<SyncSessionRow, "status" | "syncType" | "createdAt"> | undefined;
  readonly isLoading: boolean;
}): ReactNode {
  if (isLoading) {
    return (
      <div
        className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
        aria-busy="true"
      >
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-8 w-36 max-w-[50vw]" />
            <Skeleton className="h-5 w-18 rounded-full" />
          </div>
          <p className="text-muted-foreground text-sm font-normal">
            Started <Skeleton className="inline-block h-4 w-32 align-middle" />
          </p>
        </div>
      </div>
    );
  }

  if (!session) return null;

  const statusConfig = SESSION_STATUS_CONFIG[session.status];
  const typeConfig = SYNC_TYPE_CONFIG[session.syncType];

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2.5">
          <h1 className="animate-data-in text-2xl font-medium tracking-tight">
            {typeConfig.label} Sync
          </h1>
          <ThemedBadge variant={statusConfig.variant} size="sm" className="animate-data-in">
            {statusConfig.label}
          </ThemedBadge>
        </div>
        <p className="text-muted-foreground text-sm font-normal">
          Started{" "}
          <span className="animate-data-in inline-block">
            {formatShortDateTime(session.createdAt)}
          </span>
        </p>
      </div>
    </div>
  );
}
