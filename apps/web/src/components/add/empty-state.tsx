import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { mfcSearchUrl } from "@myakiba/contracts/add/constants";
import { STORE_NAMES } from "@/components/extension/extension-notice";
import { Button, buttonVariants } from "@/components/ui/button";
import { useGlide } from "@/hooks/use-glide";
import { extensionAvailability } from "@/lib/extension-availability";
import type { ExtensionAvailability } from "@/lib/extension-availability";
import type { ExtensionStatus } from "@/lib/extension-bridge";
import { useExtensionStatus } from "@/lib/extension-gate";
import { cn } from "@/lib/utils";

type EmptyAction =
  | { readonly kind: "external"; readonly label: string; readonly href: string }
  | { readonly kind: "open-search"; readonly label: string };

type EmptyMessage = { readonly body: string; readonly action: EmptyAction };

const SEARCH_THE_DATABASE: EmptyAction = {
  kind: "open-search",
  label: "Search the Item Database",
};

/** What an empty Add page says, by the extension's state and where this browser can get it. */
export function emptyMessage(
  status: ExtensionStatus["kind"],
  availability: ExtensionAvailability,
): EmptyMessage {
  if (status === "ready" || status === "outdated") {
    return {
      body: "Click Pick for myakiba on any MyFigureCollection item and it lands here.",
      action: {
        kind: "external",
        label: "Search MyFigureCollection",
        href: mfcSearchUrl(""),
      },
    };
  }
  switch (availability.kind) {
    case "listed":
      return {
        body: "Picking new items needs the myakiba extension. Anything already in the Item Database can be added without it.",
        action: {
          kind: "external",
          label: `Install from ${STORE_NAMES[availability.store]}`,
          href: availability.url,
        },
      };
    case "in_review":
      return {
        body: `The myakiba extension is in review at ${STORE_NAMES[availability.store]}, so new items can't be picked yet. Anything already in the Item Database can be added now.`,
        action: SEARCH_THE_DATABASE,
      };
    case "unsupported":
      return {
        body: "Picking new items needs the myakiba extension, on desktop Chrome or Firefox. Anything already in the Item Database can be added here.",
        action: SEARCH_THE_DATABASE,
      };
  }
}

/**
 * The body of an empty table. Until the extension answers, the message for a missing one holds its
 * room unseen, as most pages end there. An installed one's is shorter, so the block settles to it.
 */
export function EmptyState({ onSearch }: { readonly onSearch: () => void }) {
  const status = useExtensionStatus().kind;
  const availability = extensionAvailability();
  const { body, action } = emptyMessage(status, availability);
  const known = status !== "checking";
  const glide = useGlide<HTMLDivElement>(body, { axis: "height" });

  return (
    <div className="sticky start-0 flex w-[calc(100cqw-2px)] flex-col items-center gap-1.5 px-4 py-6">
      <p className="font-medium text-foreground">No items yet</p>
      <div
        ref={glide}
        inert={!known}
        className={cn(
          "flex flex-col items-center gap-4 transition-opacity duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
          !known && "opacity-0",
        )}
      >
        <p className="max-w-[65ch] text-pretty">{body}</p>
        {action.kind === "external" ? (
          <a
            href={action.href}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants()}
          >
            {action.label}
            <HugeiconsIcon icon={ArrowUpRight01Icon} data-icon="inline-end" aria-hidden="true" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : (
          <Button type="button" onClick={onSearch}>
            {action.label}
          </Button>
        )}
      </div>
    </div>
  );
}
