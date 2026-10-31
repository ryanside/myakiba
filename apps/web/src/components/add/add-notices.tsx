import { Alert02Icon, ArrowUpRight01Icon, PackageSearchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { MAX_ADD_ROWS, mfcItemUrl, mfcSearchUrl } from "@myakiba/contracts/add/constants";
import type { ReactNode } from "react";
import { MissingExtensionNotice, pickExtensionCopy } from "@/components/extension/extension-notice";
import { formatCount } from "@/components/page-header";
import { STATE_PANEL_CLASS_NAME } from "@/components/page-states";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { EXTENSION_STOPPED_TEXT } from "@/lib/pick-failure";
import type { AddController } from "./add-controller";
import { VerifyEmailNotice } from "./verify-email-notice";

/** The two screen-reader status regions, always mounted, so a change is announced. */
export function LiveRegions({ controller }: { readonly controller: AddController }) {
  const { announcement, failedPicks, full } = controller;
  return (
    <>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <p role="status" className="sr-only">
        {failedPicks > 0 ? `${formatCount(failedPicks, "pick", "picks")} could not be saved` : ""}
        {full ? `This page holds ${MAX_ADD_ROWS} items at a time.` : ""}
      </p>
    </>
  );
}

/** Verify email, extension stopped, read error, MFC hint and the row cap, in this order. */
export function Notices({ controller }: { readonly controller: AddController }) {
  const { emailVerified, unverifiedPick, email, stopped, itemsReadError, retryItems, mfc, full } =
    controller;
  return (
    <>
      {!emailVerified || unverifiedPick ? <VerifyEmailNotice email={email} /> : null}
      {stopped ? <ErrorNotice text={EXTENSION_STOPPED_TEXT} /> : null}
      {itemsReadError ? (
        <ErrorNotice
          text={itemsReadError.message}
          action={
            <Button type="button" variant="outline" size="sm" onClick={retryItems}>
              Retry
            </Button>
          }
        />
      ) : null}
      {mfc === undefined ? null : <MfcHint mfcItemId={mfc} />}
      {full ? (
        <p className="text-sm text-pretty text-muted-foreground">
          This page holds {MAX_ADD_ROWS} items at a time. Add these first, then find the rest with
          search.
        </p>
      ) : null}
    </>
  );
}

function ErrorNotice({ text, action }: { readonly text: string; readonly action?: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border/70 bg-background/70 px-3 py-2.5 text-sm"
    >
      <HugeiconsIcon
        icon={Alert02Icon}
        className="size-4 shrink-0 text-warning"
        aria-hidden="true"
      />
      <p className="min-w-0 flex-1 basis-48 text-pretty">{text}</p>
      {action}
    </div>
  );
}

function MfcHint({ mfcItemId }: { readonly mfcItemId: number }) {
  return (
    <a
      href={mfcItemUrl(mfcItemId)}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/70 px-3 py-2.5 text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="min-w-0 flex-1 text-pretty">
        MFC item #{mfcItemId} is not in myakiba yet. Open it on MyFigureCollection and click{" "}
        <span className="font-medium">Pick for myakiba</span>.
      </span>
      <HugeiconsIcon
        icon={ArrowUpRight01Icon}
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </a>
  );
}

const PICK_STEPS = [
  "Open an item on MyFigureCollection",
  "Click Pick for myakiba beside MFC's own buttons",
  "Come back and choose where it goes",
] as const;

export function EmptyState() {
  return (
    <Empty className={cn(STATE_PANEL_CLASS_NAME, "flex-1 gap-6 py-8")}>
      <EmptyHeader className="max-w-md">
        <EmptyMedia>
          <HugeiconsIcon
            icon={PackageSearchIcon}
            className="size-6 text-muted-foreground"
            aria-hidden="true"
          />
        </EmptyMedia>
        <EmptyTitle>Pick items on MyFigureCollection</EmptyTitle>
        <EmptyDescription className="text-pretty">
          Picked items wait here until you choose where they go. Search above for items already in
          myakiba.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="@container/steps max-w-2xl gap-6">
        <ol className="grid w-full list-none gap-3 text-start text-sm @xl/steps:grid-cols-3 @xl/steps:gap-6 @xl/steps:text-center">
          {PICK_STEPS.map((step, index) => (
            <li key={step} className="flex items-center gap-2.5 @xl/steps:flex-col @xl/steps:gap-2">
              <span
                className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums"
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <span className="min-w-0 text-pretty text-muted-foreground">{step}</span>
            </li>
          ))}
        </ol>
        <a
          href={mfcSearchUrl("")}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "outline" })}
        >
          Search MyFigureCollection
          <HugeiconsIcon icon={ArrowUpRight01Icon} data-icon="inline-end" aria-hidden="true" />
        </a>
        <MissingExtensionNotice copyOf={pickExtensionCopy} className="w-full max-w-md text-start" />
      </EmptyContent>
    </Empty>
  );
}
