import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  AlertCircleIcon,
  CancelCircleIcon,
  Loading03Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { Button, buttonVariants } from "@/components/ui/button";
import { EXTENSION_FAQ_HREF } from "@/components/homepage/faqs";
import { checkExtension, useExtensionStatus } from "@/lib/extension-gate";
import type { ExtensionStatus } from "@/lib/extension-bridge";
import { cn } from "@/lib/utils";

const STATUS_LINE = {
  checking: { icon: Loading03Icon, label: "Looking for the extension…", tone: "" },
  absent: { icon: CancelCircleIcon, label: "Not installed", tone: "text-muted-foreground" },
  outdated: { icon: AlertCircleIcon, label: "Update needed", tone: "text-warning-foreground" },
  ready: { icon: Tick02Icon, label: "Extension connected", tone: "text-success-foreground" },
} as const satisfies Record<
  ExtensionStatus["kind"],
  { readonly icon: IconSvgElement; readonly label: string; readonly tone: string }
>;

export function ExtensionStep() {
  const status = useExtensionStatus();
  const [rechecking, setRechecking] = useState(false);
  const line = STATUS_LINE[status.kind];
  const spinning = status.kind === "checking" || rechecking;

  const recheck = async () => {
    setRechecking(true);
    await checkExtension();
    setRechecking(false);
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg bg-muted/45 p-4 ring-1 ring-foreground/8">
      <p className={cn("flex items-center gap-2 text-sm font-medium", line.tone)} role="status">
        <HugeiconsIcon
          icon={spinning ? Loading03Icon : line.icon}
          strokeWidth={2}
          className={cn("size-4", spinning && "animate-spin motion-reduce:animate-none")}
        />
        {line.label}
      </p>
      {status.kind === "absent" || status.kind === "outdated" ? (
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={EXTENSION_FAQ_HREF}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ size: "sm" })}
          >
            {status.kind === "absent" ? "How to install it" : "How to update it"}
          </a>
          <Button variant="outline" size="sm" disabled={rechecking} onClick={recheck}>
            Check again
          </Button>
          <span className="text-xs text-muted-foreground">
            Reload this page after you install it.
          </span>
        </div>
      ) : null}
    </div>
  );
}
