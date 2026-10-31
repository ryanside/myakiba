import { Alert02Icon, ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { MAX_ADD_ROWS, mfcItemUrl } from "@myakiba/contracts/add/constants";
import type { ReactNode } from "react";
import { formatCount } from "@/components/page-header";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EXTENSION_STOPPED_TEXT } from "@/lib/pick-failure";
import { cn } from "@/lib/utils";
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
      {stopped ? <ErrorNotice variant="default" text={EXTENSION_STOPPED_TEXT} /> : null}
      {itemsReadError ? (
        <ErrorNotice
          variant="destructive"
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
        <Alert role="note">
          <AlertDescription>
            This page holds {MAX_ADD_ROWS} items at a time. Add these first, then find the rest with
            search.
          </AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}

function ErrorNotice({
  text,
  action,
  variant,
}: {
  readonly text: string;
  readonly action?: ReactNode;
  readonly variant: "default" | "destructive";
}) {
  return (
    <Alert variant={variant}>
      <HugeiconsIcon
        icon={Alert02Icon}
        className={cn(variant === "default" && "text-warning-foreground")}
        aria-hidden="true"
      />
      <AlertDescription>{text}</AlertDescription>
      {action ? <AlertAction>{action}</AlertAction> : null}
    </Alert>
  );
}

function MfcHint({ mfcItemId }: { readonly mfcItemId: number }) {
  return (
    <Alert role="note" className="transition-colors hover:bg-muted">
      <HugeiconsIcon
        icon={ArrowUpRight01Icon}
        className="text-muted-foreground"
        aria-hidden="true"
      />
      <AlertDescription className="text-foreground [&_a]:no-underline">
        {/* The link's box covers the notice, so all of it opens MFC. */}
        <a
          href={mfcItemUrl(mfcItemId)}
          target="_blank"
          rel="noopener noreferrer"
          className="outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
        >
          MFC item #{mfcItemId} is not in myakiba yet. Open it on MyFigureCollection and click{" "}
          <span className="font-medium">Pick for myakiba</span>.
        </a>
      </AlertDescription>
    </Alert>
  );
}
