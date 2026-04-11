import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { useCallback, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SYNC_TYPE_CONFIG } from "@/lib/sync";
import {
  LAUNCHABLE_SYNC_OPTIONS,
  SyncActionSheet,
  type LaunchableSyncType,
} from "@/components/sync/sync-launcher";

type SyncWidgetProps = {
  readonly TriggerWrapper: React.ReactElement;
};

export default function SyncWidget({ TriggerWrapper }: SyncWidgetProps) {
  const [syncType, setSyncType] = useState<LaunchableSyncType | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const handleOptionSelect = useCallback((type: LaunchableSyncType) => {
    setPopoverOpen(false);
    setSyncType(type);
  }, []);

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger render={TriggerWrapper} />
        <PopoverContent align="start" className="w-56 p-1">
          {LAUNCHABLE_SYNC_OPTIONS.map((option) => {
            const config = SYNC_TYPE_CONFIG[option.type];
            return (
              <button
                key={option.type}
                type="button"
                onClick={() => handleOptionSelect(option.type)}
                className="group/item flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors duration-150 hover:bg-accent cursor-pointer"
              >
                <HugeiconsIcon
                  icon={option.icon}
                  className="size-4 shrink-0 text-muted-foreground transition-colors duration-150 group-hover/item:text-foreground"
                />
                <span className="min-w-0 flex-1 text-sm">{config.label}</span>
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  className="size-3 shrink-0 text-muted-foreground/50 -translate-x-0.5 opacity-0 transition-[transform,opacity] duration-150 group-hover/item:translate-x-0 group-hover/item:opacity-100"
                />
              </button>
            );
          })}
        </PopoverContent>
      </Popover>

      <SyncActionSheet syncType={syncType} onSyncTypeChange={setSyncType} side="left" />
    </>
  );
}
