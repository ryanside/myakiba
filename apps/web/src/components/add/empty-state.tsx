import { HugeiconsIcon } from "@hugeicons/react";
import {
  PICK,
  RUNS_IN,
  installLink,
  meanwhile,
  pickHowTo,
  reviewTitle,
} from "@/components/extension/extension-notice";
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
  /** The row under the message holds both searches, so only a store link is the message's own. */
  readonly link: { readonly label: string; readonly href: string } | null;
};

/** What an empty Add page says, by the extension's state and where this browser can get it. */
export function emptyMessage(
  status: ExtensionStatus["kind"],
  availability: ExtensionAvailability,
): EmptyMessage {
  if (status === "ready" || status === "outdated") {
    return { body: pickHowTo("here"), link: null };
  }
  switch (availability.kind) {
    case "listed":
      return {
        body: "Install the myakiba extension, then click Pick for myakiba on any MyFigureCollection item and it lands here.",
        link: installLink(availability),
      };
    case "in_review": {
      const { body, link } = meanwhile(PICK, availability.alternative);
      return { body: `${reviewTitle(availability.store)}. ${body}`, link };
    }
    case "unsupported":
      return {
        body: `Picking items needs the myakiba extension, which runs ${RUNS_IN}.`,
        link: null,
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
  const { body, link } = emptyMessage(status, availability);
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
        {link ? (
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants()}
          >
            {link.label}
            <HugeiconsIcon icon={ExternalIcon} data-icon="inline-end" aria-hidden="true" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : null}
      </div>
    </div>
  );
}
