import type { ReactNode } from "react";
import type { SyncSessionRow } from "@myakiba/contracts/sync/types";
import { ThemedBadge } from "@/components/reui/badge";
import { SESSION_STATUS_CONFIG, SYNC_TYPE_CONFIG } from "@/lib/sync";
import { formatShortDateTime } from "@/lib/date-display";

export function SyncSessionHero({
  session,
}: {
  readonly session: Pick<SyncSessionRow, "status" | "syncType" | "createdAt">;
}): ReactNode {
  const statusConfig = SESSION_STATUS_CONFIG[session.status];
  const typeConfig = SYNC_TYPE_CONFIG[session.syncType];

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-medium tracking-tight">{typeConfig.label} Sync</h1>
          <ThemedBadge variant={statusConfig.variant} size="sm">
            {statusConfig.label}
          </ThemedBadge>
        </div>
        <p className="text-muted-foreground text-sm font-normal">
          Started {formatShortDateTime(session.createdAt)}
        </p>
      </div>
    </div>
  );
}
