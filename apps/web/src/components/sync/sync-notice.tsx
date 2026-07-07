import { HugeiconsIcon } from "@hugeicons/react";
import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const SYNC_DESCRIPTION =
  "MyFigureCollection locks NSFW item details behind account authentication, so we can't scrape them during sync. We'll add support in the future if we find a workaround.";

export function SyncNotice() {
  return (
    <Alert>
      <HugeiconsIcon icon={InformationCircleIcon} />
      <AlertTitle className="flex items-center gap-x-2">
        <span>MyFigureCollection NSFW items aren&apos;t supported yet</span>
        <Tooltip>
          <TooltipTrigger className="text-sm text-muted-foreground underline hover:text-foreground">
            Why?
          </TooltipTrigger>
          <TooltipContent>
            <p>{SYNC_DESCRIPTION}</p>
          </TooltipContent>
        </Tooltip>
      </AlertTitle>
    </Alert>
  );
}
