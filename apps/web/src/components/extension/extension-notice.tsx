import { HugeiconsIcon } from "@hugeicons/react";
import { PuzzleIcon } from "@hugeicons/core-free-icons";
import { EXTENSION_MIN_BROWSER_VERSION } from "@myakiba/contracts/shared/extension-browsers";
import { buttonVariants } from "@/components/ui/button";
import { extensionAvailability } from "@/lib/extension-availability";
import type { ExtensionAvailability } from "@/lib/extension-availability";
import { useExtensionStatus } from "@/lib/extension-gate";
import type { ExtensionStore } from "@/lib/extension-listings";
import { cn } from "@/lib/utils";

export const STORE_NAMES = {
  chromeWebStore: "the Chrome Web Store",
  firefoxAddons: "Firefox Add-ons",
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

export const UNDER_REVIEW_TITLE = "The myakiba browser extension is under review";

export function underReviewBody(stores: readonly ExtensionStore[]): string {
  const where = stores.map((store) => STORE_NAMES[store]).join(" and ");
  return `It is in review at ${where} now, and it will be released shortly. It will be the new way to import items from MyFigureCollection. Importing needs it, so importing is unavailable until it passes review.`;
}

/** What to tell a visitor without the extension, by where their browser gets it. */
export function missingExtensionCopy(availability: ExtensionAvailability): ExtensionNoticeCopy {
  switch (availability.kind) {
    case "listed":
      return {
        title: "Install the myakiba extension first",
        body: `myakiba imports MyFigureCollection items through its browser extension, with your own MyFigureCollection sign-in. Install it from ${STORE_NAMES[availability.store]}, then reload this page.`,
        link: { label: `Install from ${STORE_NAMES[availability.store]}`, href: availability.url },
      };
    case "in_review":
      return { title: UNDER_REVIEW_TITLE, body: underReviewBody([availability.store]), link: null };
    case "unsupported":
      return {
        title: "Importing needs desktop Chrome or Firefox",
        body: `myakiba imports MyFigureCollection items through its browser extension, which runs on a computer in Chrome, Edge or another Chromium browser, or in Firefox, version ${EXTENSION_MIN_BROWSER_VERSION} or later. Open myakiba in one of them to import.`,
        link: null,
      };
  }
}

const ALREADY_ADDABLE = "Items already in the Item Database can still be added";

/** The same, for a surface that takes new Items by Pick rather than by import. */
export function pickExtensionCopy(availability: ExtensionAvailability): ExtensionNoticeCopy {
  switch (availability.kind) {
    case "listed":
      return {
        title: "Install the myakiba extension to pick items",
        body: `Picking needs the myakiba browser extension, which reads MyFigureCollection pages with your own sign-in. Install it from ${STORE_NAMES[availability.store]}, then reload this page. ${ALREADY_ADDABLE} without it.`,
        link: { label: `Install from ${STORE_NAMES[availability.store]}`, href: availability.url },
      };
    case "in_review":
      return {
        title: UNDER_REVIEW_TITLE,
        body: `It is in review at ${STORE_NAMES[availability.store]} now, and it will be released shortly. Until it is listed, new items can't be picked. ${ALREADY_ADDABLE}.`,
        link: null,
      };
    case "unsupported":
      return {
        title: "Picking needs desktop Chrome or Firefox",
        body: `The myakiba browser extension runs on a computer in Chrome, Edge or another Chromium browser, or in Firefox, version ${EXTENSION_MIN_BROWSER_VERSION} or later. Open myakiba in one of them to pick items. ${ALREADY_ADDABLE} here.`,
        link: null,
      };
  }
}

export function ExtensionNotice({
  copy,
  className,
}: {
  readonly copy: ExtensionNoticeCopy;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg bg-muted/45 p-3 text-left ring-1 ring-foreground/8",
        className,
      )}
    >
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
      className={cn(buttonVariants({ size: "sm" }), className)}
    >
      {link.label}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** Says how to get the extension where it is needed, only while it is not installed. */
export function MissingExtensionNotice({
  copyOf = missingExtensionCopy,
  className,
}: {
  readonly copyOf?: (availability: ExtensionAvailability) => ExtensionNoticeCopy;
  readonly className?: string;
}) {
  const status = useExtensionStatus();
  if (status.kind !== "absent") return null;
  return <ExtensionNotice copy={copyOf(extensionAvailability())} className={className} />;
}
