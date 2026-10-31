import { Alert02Icon, ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { MAX_ADD_ROWS, mfcItemUrl, mfcSearchUrl } from "@myakiba/contracts/add/constants";
import type { ReactNode } from "react";
import { ExtensionNotice, pickExtensionCopy } from "@/components/extension/extension-notice";
import { formatCount } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { extensionAvailability } from "@/lib/extension-availability";
import { useExtensionStatus } from "@/lib/extension-gate";
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

const EMPTY_TEXT = "Click Pick for myakiba on a MyFigureCollection item and it waits here.";

/** One line where the rows will be, or, with no extension to pick with, what to do about that. */
export function EmptyState() {
  const status = useExtensionStatus();
  if (status.kind === "absent") {
    return (
      <ExtensionNotice
        copy={pickExtensionCopy(extensionAvailability())}
        className="rounded-xl bg-card ring-foreground/10"
      />
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl bg-card px-3 py-2.5 text-sm ring-1 ring-foreground/10">
      <p className="min-w-0 flex-1 basis-56 text-pretty">{EMPTY_TEXT}</p>
      <a
        href={mfcSearchUrl("")}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonVariants({ variant: "outline" })}
      >
        Search MyFigureCollection
        <HugeiconsIcon icon={ArrowUpRight01Icon} data-icon="inline-end" aria-hidden="true" />
      </a>
    </div>
  );
}
