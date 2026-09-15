import { HugeiconsIcon } from "@hugeicons/react";
import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const SYNC_DESCRIPTION =
  "MFC now uses content levels (General, Intermediate, Explicit, and Controversial) to control item access. Intermediate, Explicit, and Controversial content level items cannot be scraped by myakiba since they are locked behind MFC user-authentication. :(";

export function SyncNotice() {
  return (
    <Alert>
      <HugeiconsIcon icon={InformationCircleIcon} />
      <AlertTitle className="min-w-0">
        <span>MyFigureCollection content-restricted items may not import</span>{" "}
        <Tooltip>
          <TooltipTrigger className="text-sm text-muted-foreground underline">Why?</TooltipTrigger>
          <TooltipContent>
            <p>{SYNC_DESCRIPTION}</p>
          </TooltipContent>
        </Tooltip>
      </AlertTitle>
    </Alert>
  );
}
