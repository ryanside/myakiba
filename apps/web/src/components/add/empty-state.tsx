import { HugeiconsIcon } from "@hugeicons/react";
import { STORE_NAMES } from "@/components/extension/extension-notice";
import { buttonVariants } from "@/components/ui/button";
import { useGlide } from "@/hooks/use-glide";
import { extensionAvailability } from "@/lib/extension-availability";
import type { ExtensionAvailability } from "@/lib/extension-availability";
import type { ExtensionStatus } from "@/lib/extension-bridge";
import { useExtensionStatus } from "@/lib/extension-gate";
import { ExternalIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { FRAME_WIDTH } from "./row-fields";

type EmptyMessage = {
  readonly body: string;
  /** The row under the message holds both searches, so only an install is the message's own. */
  readonly install: { readonly label: string; readonly href: string } | null;
};

/** What an empty Add page says, by the extension's state and where this browser can get it. */
export function emptyMessage(
  status: ExtensionStatus["kind"],
  availability: ExtensionAvailability,
): EmptyMessage {
  if (status === "ready" || status === "outdated") {
    return {
      body: "Click Pick for myakiba on any MyFigureCollection item and it lands here.",
      install: null,
    };
  }
  switch (availability.kind) {
    case "listed":
      return {
        body: "Picking new items needs the myakiba extension. Items already in myakiba can be added without it.",
        install: {
          label: `Install from ${STORE_NAMES[availability.store]}`,
          href: availability.url,
        },
      };
    case "in_review":
      return {
        body: `The myakiba extension is in review at ${STORE_NAMES[availability.store]}, so new items can't be picked yet. Items already in myakiba can be added now.`,
        install: null,
      };
    case "unsupported":
      return {
        body: "Picking new items needs the myakiba extension, on desktop Chrome or Firefox. Items already in myakiba can be added here.",
        install: null,
      };
  }
}

/**
 * The body of an empty table. Until the extension answers, the message for a missing one holds its
 * room unseen, as most pages end there. An installed one's is shorter, so the block settles to it.
 */
export function EmptyState() {
  const status = useExtensionStatus().kind;
  const availability = extensionAvailability();
  const { body, install } = emptyMessage(status, availability);
  const known = status !== "checking";
  const glide = useGlide<HTMLDivElement>(body, { axis: "height" });

  return (
    <div className={cn(FRAME_WIDTH, "flex flex-col items-center gap-1.5 px-4 py-6")}>
      <p className="font-medium text-foreground">No items yet</p>
      <div
        ref={glide}
        inert={!known}
        className={cn(
          "flex flex-col items-center gap-4 transition-opacity duration-(--motion-data-in) ease-out",
          !known && "opacity-0",
        )}
      >
        <p className="max-w-[65ch] text-pretty">{body}</p>
        {install ? (
          <a
            href={install.href}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants()}
          >
            {install.label}
            <HugeiconsIcon icon={ExternalIcon} data-icon="inline-end" aria-hidden="true" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : null}
      </div>
    </div>
  );
}
