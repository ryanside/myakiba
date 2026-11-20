import { HugeiconsIcon } from "@hugeicons/react";
import { PuzzleIcon } from "@hugeicons/core-free-icons";
import { EXTENSION_MIN_BROWSER_VERSION } from "@myakiba/contracts/shared/extension-browsers";
import { buttonVariants } from "@/components/ui/button";
import { extensionAvailability } from "@/lib/extension-availability";
import type { ExtensionAvailability, ExtensionListing } from "@/lib/extension-availability";
import { useExtensionStatus } from "@/lib/extension-gate";
import type { ExtensionStore } from "@/lib/extension-listings";
import { cn } from "@/lib/utils";

export const STORE_NAMES = {
  chromeWebStore: "the Chrome Web Store",
  firefoxAddons: "Firefox Add-ons",
} as const satisfies Record<ExtensionStore, string>;

const STORE_BROWSERS = {
  chromeWebStore: "Chrome, Edge or another Chromium browser",
  firefoxAddons: "Firefox",
} as const satisfies Record<ExtensionStore, string>;

export type ExtensionNoticeCopy = {
  readonly title: string;
  readonly body: string;
  readonly link: { readonly label: string; readonly href: string } | null;
};

export const EXTENSION_FAQ_ID = "faq-extension";

export const EXTENSION_UPDATE_FAQ_ID = "faq-extension-update";

export const UPDATE_LINK = {
  label: "How to update it",
  href: `/#${EXTENSION_UPDATE_FAQ_ID}`,
} as const;

/** What a surface needs the extension for, in the words each notice uses. */
type Task = { readonly installTitle: string; readonly doing: string; readonly does: string };

const REFRESH: Task = {
  installTitle: "Install the myakiba extension first",
  doing: "Refreshing item details",
  does: "Refresh item details",
};

export const PICK: Task = {
  installTitle: "Install the myakiba extension to pick items",
  doing: "Picking items",
  does: "Pick items",
};

export const RUNS_IN = `on a computer in Chrome, Edge or another Chromium browser, or in Firefox ${EXTENSION_MIN_BROWSER_VERSION} or later`;

export function installLink(listing: ExtensionListing): NonNullable<ExtensionNoticeCopy["link"]> {
  return { label: `Install from ${STORE_NAMES[listing.store]}`, href: listing.url };
}

export function reviewTitle(store: ExtensionStore): string {
  return `The myakiba extension is in review at ${STORE_NAMES[store]}`;
}

/** What to do while this browser's store reviews the extension: use another store's, or wait. */
export function meanwhile(
  task: Task,
  alternative: ExtensionListing | null,
): Pick<ExtensionNoticeCopy, "body" | "link"> {
  if (alternative === null) return { body: `${task.doing} works once it's approved.`, link: null };
  return {
    body: `${task.does} in ${STORE_BROWSERS[alternative.store]} until then.`,
    link: { label: `View on ${STORE_NAMES[alternative.store]}`, href: alternative.url },
  };
}

function noticeCopy(availability: ExtensionAvailability, task: Task): ExtensionNoticeCopy {
  switch (availability.kind) {
    case "listed":
      return {
        title: task.installTitle,
        body: "Reload this page after you install it.",
        link: installLink(availability),
      };
    case "in_review":
      return {
        title: reviewTitle(availability.store),
        ...meanwhile(task, availability.alternative),
      };
    case "unsupported":
      return {
        title: `${task.doing} needs the myakiba extension`,
        body: `It runs ${RUNS_IN}.`,
        link: null,
      };
  }
}

/** What to tell a visitor without the extension, by where their browser gets it. */
export function missingExtensionCopy(availability: ExtensionAvailability): ExtensionNoticeCopy {
  return noticeCopy(availability, REFRESH);
}

/** The same, for a surface that takes new Items by Pick. */
export function pickExtensionCopy(availability: ExtensionAvailability): ExtensionNoticeCopy {
  return noticeCopy(availability, PICK);
}

export function ExtensionNotice({
  copy,
  className,
}: {
  readonly copy: ExtensionNoticeCopy;
  readonly className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border p-4 text-left", className)}>
      <HugeiconsIcon
        icon={PuzzleIcon}
        strokeWidth={2}
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <div className="flex min-w-0 flex-col items-start gap-1">
        <p className="text-sm font-medium text-foreground">{copy.title}</p>
        <p className="text-pretty text-sm text-muted-foreground">{copy.body}</p>
        {copy.link ? <ExtensionLink link={copy.link} className="mt-2" /> : null}
      </div>
    </div>
  );
}

export function ExtensionLink({
  link,
  className,
}: {
  readonly link: NonNullable<ExtensionNoticeCopy["link"]>;
  readonly className?: string;
}) {
  return (
    <a
      href={link.href}
      target="_blank"
      rel="noreferrer"
      className={cn(buttonVariants(), className)}
    >
      {link.label}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** Says how to get the extension where it is needed, only while it is not installed. */
export function MissingExtensionNotice({
  copyOf,
  className,
}: {
  readonly copyOf: (availability: ExtensionAvailability) => ExtensionNoticeCopy;
  readonly className?: string;
}) {
  const status = useExtensionStatus();
  if (status.kind !== "absent") return null;
  return <ExtensionNotice copy={copyOf(extensionAvailability())} className={className} />;
}
