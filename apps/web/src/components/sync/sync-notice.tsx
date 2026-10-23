import { HugeiconsIcon } from "@hugeicons/react";
import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const SYNC_DESCRIPTION =
  "MFC uses content levels (General, Intermediate, Explicit, and Controversial) to control item access. The myakiba extension fetches items with your own MyFigureCollection sign-in, so it imports Intermediate, Explicit, and Controversial items your account can see.";

export function SyncNotice() {
  return (
    <Alert>
      <HugeiconsIcon icon={InformationCircleIcon} />
      <AlertTitle className="min-w-0">
        <span>Sign in to MyFigureCollection to import content-restricted items</span>{" "}
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
