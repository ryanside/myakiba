import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SyncActionSheet } from "@/components/sync/sync-launcher";
import { LAUNCHABLE_SYNC_OPTIONS } from "@/components/sync/sync-launcher-options";
import type { LaunchableSyncType } from "@/components/sync/sync-launcher-options";

type SyncWidgetProps = {
  readonly TriggerWrapper: React.ReactElement;
  readonly side?: "left" | "right";
};

export default function SyncWidget({ TriggerWrapper, side = "left" }: SyncWidgetProps) {
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
        <PopoverContent
          align={side === "left" ? "start" : "end"}
          className="w-64 max-w-[calc(100vw-2rem)] p-1 gap-y-0"
        >
          {LAUNCHABLE_SYNC_OPTIONS.map((option) => (
            <Button
              key={option.type}
              type="button"
              variant="ghost"
              onClick={() => handleOptionSelect(option.type)}
              className="group/item h-auto w-full justify-start gap-2.5 rounded-md px-2 py-1.5 text-left font-normal hover:bg-accent duration-0"
            >
              <HugeiconsIcon
                icon={option.icon}
                data-icon="inline-start"
                className="size-4 shrink-0 text-muted-foreground group-hover/item:text-foreground duration-0"
              />
              <span className="min-w-0 flex-1 whitespace-normal text-sm">{option.label}</span>
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                data-icon="inline-end"
                className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover/item:opacity-100 duration-0"
              />
            </Button>
          ))}
        </PopoverContent>
      </Popover>

      <SyncActionSheet syncType={syncType} onSyncTypeChange={setSyncType} side={side} />
    </>
  );
}
