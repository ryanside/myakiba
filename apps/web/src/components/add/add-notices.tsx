import { Alert02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { mfcItemUrl } from "@myakiba/contracts/add/constants";
import type { ReactNode } from "react";
import { formatCount } from "@/components/page-header";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ExternalIcon } from "@/lib/icons";
import { EXTENSION_STOPPED_TEXT } from "@/lib/pick-failure";
import { cn } from "@/lib/utils";
import type { AddController } from "./add-controller";
import { VerifyEmailNotice } from "./verify-email-notice";

/** The two screen-reader status regions, always mounted, so a change is announced. */
export function LiveRegions({ controller }: { readonly controller: AddController }) {
  const { announcement, failedPicks, waiting } = controller;
  return (
    <>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <p role="status" className="sr-only">
        {[
          failedPicks > 0 ? `${formatCount(failedPicks, "pick", "picks")} could not be saved` : "",
          waiting > 0 ? waitingText(waiting) : "",
        ]
          .filter(Boolean)
          .join(". ")}
      </p>
    </>
  );
}

export function Notices({ controller }: { readonly controller: AddController }) {
  const {
    emailVerified,
    unverifiedPick,
    email,
    stopped,
    itemsReadError,
    retryItems,
    mfc,
    waiting,
  } = controller;
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
      {waiting > 0 ? (
        <Alert role="note">
          <AlertDescription>{waitingText(waiting)}</AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}

function waitingText(waiting: number): string {
  return waiting === 1
    ? "1 more item waits and comes in as you add or remove these."
    : `${waiting.toLocaleString()} more items wait and come in as you add or remove these.`;
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
    <Alert role="note" className="color-motion hover:bg-muted">
      <HugeiconsIcon icon={ExternalIcon} className="text-muted-foreground" aria-hidden="true" />
      <AlertDescription className="text-foreground [&_a]:no-underline">
        {/* The link's box covers the notice, so all of it opens MFC. */}
        <a
          href={mfcItemUrl(mfcItemId)}
          target="_blank"
          rel="noopener noreferrer"
          className="outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring"
        >
          MFC item #{mfcItemId} is not in myakiba yet. Open it on MyFigureCollection and click{" "}
          <span className="font-medium">Pick for myakiba</span>.
        </a>
      </AlertDescription>
    </Alert>
  );
}
