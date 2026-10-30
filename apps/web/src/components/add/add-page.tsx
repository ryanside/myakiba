import { Alert02Icon, ArrowUpRight01Icon, PackageSearchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { MAX_ADD_ROWS, mfcItemUrl, mfcSearchUrl } from "@myakiba/contracts/add/constants";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import type { NavigateOptions } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { MissingExtensionNotice, pickExtensionCopy } from "@/components/extension/extension-notice";
import { PageHeader, formatCount } from "@/components/page-header";
import { STATE_ICON_CLASS_NAME } from "@/components/page-states";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { toast } from "@/components/ui/toast";
import { useRead } from "@/data/client";
import { add, usePickIntake } from "@/data/resources/add";
import { orders } from "@/data/resources/orders";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import type { AddSearch as AddSearchParams } from "@/lib/add-search";
import { EXTENSION_STOPPED_TEXT, pickFailureCopy } from "@/lib/pick-failure";
import { useAddDraft } from "./add-draft";
import { AddRows, removeButtonId } from "./add-rows";
import type { ItemsLookup } from "./add-rows";
import { AddSearch } from "./add-search";
import { CommitButton } from "./commit-button";
import type { CommitAnswer } from "./commit-button";
import { defaultOrderTitle, destinationOf, presetDestination } from "./commit-input";
import type { AddItem, CommitIssue, CommitRow, Destination, DestinationForm } from "./commit-input";
import { showCommitToast } from "./commit-toast";
import { DestinationBar } from "./destination-bar";
import { VerifyEmailNotice } from "./verify-email-notice";

const appRouteApi = getRouteApi("/(app)");

// The header and this page's padding take 6rem, and the inset sidebar's margin 1rem more. Rows
// scroll here, so the destination bar stays in view and never covers a focused field. Below 36rem
// tall the page flows and scrolls as a whole.
const PAGE_HEIGHT =
  "h-[calc(100dvh-6rem)] md:h-[calc(100dvh-7rem)] [@media(max-height:36rem)]:h-auto";

export function AddPage({ search }: { readonly search: AddSearchParams }) {
  const { session } = appRouteApi.useRouteContext();
  const { emailVerified, email } = session.user;
  const { currency, dateFormat } = useUserPreferences();
  const navigate = useNavigate();
  const { rows, full, dispatch } = useAddDraft(search.item);
  const searchInput = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<DestinationForm>(() => presetDestination(search.to));
  const [issues, setIssues] = useState<readonly CommitIssue[]>([]);
  const [announcement, setAnnouncement] = useState("");

  const intake = usePickIntake({
    emailVerified,
    onSaved: (itemIds) => {
      dispatch({ type: "add", itemIds });
      setAnnouncement("A picked item is ready to add");
    },
  });

  // The draft holds the row now, so a reload after its commit must not add it again.
  const hasPresetItem = search.item !== undefined;
  useEffect(() => {
    if (!hasPresetItem) return;
    void navigate({
      to: ".",
      search: ({ item: _item, ...rest }) => rest,
      replace: true,
    } as NavigateOptions);
  }, [hasPresetItem, navigate]);

  const draftItemIds = rows.map((row) => row.itemId);
  const {
    data: itemData,
    isPending: itemsPending,
    isPlaceholderData: itemsStale,
    error: itemsError,
    refetch: refetchItems,
  } = useRead(add.items, draftItemIds);
  const itemsLoading = draftItemIds.length > 0 && (itemsPending || itemsStale);
  const items: ReadonlyMap<string, AddItem> = new Map(
    (itemData?.items ?? []).map((item) => [item.itemId, item]),
  );
  // A failed refresh leaves the Items it already read, so only a row without one needs the error.
  const itemsReadError =
    itemsError !== null && rows.some((row) => !items.has(row.itemId)) ? itemsError : null;
  const itemsLookup = lookupOf(itemsLoading, itemsReadError !== null);

  const presetOrderId =
    form.order.kind === "existing" && form.order.order?.title === null ? form.order.order.id : null;
  const { data: presetOrder, isError: presetOrderMissing } = useRead(
    orders.detail,
    presetOrderId ?? "",
    { enabled: presetOrderId !== null },
  );
  const resolveOrder = (): DestinationForm["order"] => {
    if (presetOrderId === null) return form.order;
    if (presetOrderMissing) return { kind: "existing", order: null };
    return presetOrder
      ? { kind: "existing", order: { id: presetOrderId, title: presetOrder.title } }
      : form.order;
  };
  const resolvedForm: DestinationForm = { ...form, order: resolveOrder() };
  const destination = destinationOf(resolvedForm);

  const selectedRows = rows.flatMap((row) => {
    const item = items.get(row.itemId);
    return row.selected && item ? [{ row, item }] : [];
  });
  const commitRows: readonly CommitRow[] = selectedRows.map(({ row, item }) => ({
    row,
    title: item.title,
  }));
  const newOrderTitle = defaultOrderTitle(commitRows.map(({ title }) => title));
  const failedPicks = intake.rows.filter((pick) => pick.state === "failed").length;
  const unverifiedPick = intake.rows.some(
    (pick) => pick.state === "failed" && pick.reason.kind === "unverified",
  );

  const handleRetryItems = async () => {
    // The read hides this button while it runs, so focus moves before the button goes.
    searchInput.current?.focus();
    await refetchItems();
  };

  const handleEdit: Parameters<typeof AddRows>[0]["onEdit"] = (itemId, overrides) => {
    setIssues([]);
    dispatch({ type: "edit", itemId, overrides });
  };

  const handleRemove = (itemId: string) => {
    const index = rows.findIndex((row) => row.itemId === itemId);
    const neighbour = rows[index + 1] ?? rows[index - 1];
    // The removed button had focus, so focus moves once the row is gone, not to the page's start.
    flushSync(() => dispatch({ type: "remove", itemIds: [itemId] }));
    const next =
      neighbour &&
      document.querySelector<HTMLElement>(`[id="${removeButtonId(neighbour.itemId)}"]`);
    (next ?? searchInput.current)?.focus();
    setAnnouncement(`Removed ${items.get(itemId)?.title ?? "the row"}`);
  };

  const handleRetryPick = async (mfcItemId: Parameters<typeof intake.retry>[0]) =>
    // A failed retry shows its reason on the row.
    intake.retry(mfcItemId);

  const handleDiscardPick = async (mfcItemId: Parameters<typeof intake.discard>[0]) => {
    const discarded = await intake.discard(mfcItemId);
    if (discarded.isErr()) {
      toast.add({ type: "error", title: pickFailureCopy(discarded.error, mfcItemId).text });
    }
  };

  const clearCommitted = (itemIds: readonly string[]) => {
    dispatch({ type: "remove", itemIds });
    setForm(presetDestination(search.to));
    setIssues([]);
    searchInput.current?.focus();
  };

  const handleCommitted = (answer: CommitAnswer) => {
    clearCommitted(answer.committed.map(({ itemId }) => itemId));
    showCommitToast(
      {
        ownership: destination.ownership ?? { kind: "none" },
        orderTitle: orderTitleOf(destination, newOrderTitle),
        wishlist: destination.wishlist,
        lists: destination.lists,
        answer,
      },
      navigate,
    );
  };

  const handleDone = () => {
    clearCommitted(commitRows.map(({ row }) => row.itemId));
    const committed = selectedRows.map(({ item: { itemId, externalId, title, image } }) => ({
      itemId,
      externalId,
      title,
      image,
      collectionId: null,
    }));
    showCommitToast(
      {
        ownership: { kind: "none" },
        orderTitle: null,
        wishlist: false,
        lists: [],
        answer: { committed, orderId: null, wishlistAdded: 0, listIds: [] },
      },
      navigate,
    );
  };

  const handleIssues = (next: readonly CommitIssue[]) => {
    setIssues(next);
    const [first] = next;
    if (first === undefined) return;
    // The fee fields open themselves once they hold an issue, so focus waits for that render.
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[id="${first.fieldId}"]`)?.focus();
    });
  };

  const hasRows = rows.length > 0 || intake.rows.length > 0;

  return (
    <div className={`mx-auto flex w-full max-w-5xl flex-col gap-4 ${PAGE_HEIGHT}`}>
      <PageHeader
        title={search.from === "mfc" ? "Review your picks" : "Add items"}
        meta={rows.length > 0 ? formatCount(rows.length, "Item", "Items") : null}
      />

      <AddSearch
        initialQuery={search.q ?? ""}
        draftItemIds={new Set(draftItemIds)}
        inputRef={searchInput}
        onAdd={({ itemId, title }) => {
          dispatch({ type: "add", itemIds: [itemId] });
          setAnnouncement(`Added ${title}`);
        }}
      />

      <p role="status" className="sr-only">
        {announcement}
      </p>
      <p role="status" className="sr-only">
        {failedPicks > 0 ? `${formatCount(failedPicks, "pick", "picks")} could not be saved` : ""}
        {full ? `This page holds ${MAX_ADD_ROWS} items at a time.` : ""}
      </p>

      {!emailVerified || unverifiedPick ? <VerifyEmailNotice email={email} /> : null}

      {intake.stopped ? <ErrorNotice text={EXTENSION_STOPPED_TEXT} /> : null}

      {itemsReadError ? (
        <ErrorNotice
          text={itemsReadError.message}
          action={
            <Button type="button" variant="outline" size="sm" onClick={handleRetryItems}>
              Retry
            </Button>
          }
        />
      ) : null}

      {search.mfc === undefined ? null : <MfcHint mfcItemId={search.mfc} />}

      {full ? (
        <p className="text-sm text-pretty text-muted-foreground">
          This page holds {MAX_ADD_ROWS} items at a time. Add these first, then find the rest with
          search.
        </p>
      ) : null}

      {hasRows ? (
        <>
          <div className="min-h-32 shrink overflow-y-auto overscroll-contain rounded-xl border border-border/70 bg-background/70 backdrop-blur-sm [@media(max-height:36rem)]:overflow-visible">
            <AddRows
              picks={intake.rows}
              rows={rows}
              items={items}
              lookup={itemsLookup}
              ownership={destination.ownership}
              currency={currency}
              dateFormat={dateFormat}
              issues={issues}
              onSelect={(itemId, selected) => dispatch({ type: "select", itemId, selected })}
              onSelectAll={(selected) => dispatch({ type: "select-all", selected })}
              onEdit={handleEdit}
              onRemove={handleRemove}
              onRetryPick={handleRetryPick}
              onDiscardPick={handleDiscardPick}
            />
          </div>
          {rows.length > 0 ? (
            <div className="mt-auto flex max-h-[55dvh] min-h-0 shrink-0 flex-col [@media(max-height:36rem)]:max-h-none">
              <DestinationBar
                form={resolvedForm}
                destination={destination}
                selectedCount={commitRows.length}
                defaultOrderTitle={newOrderTitle}
                currency={currency}
                issues={issues}
                onChange={(next) => {
                  setIssues([]);
                  setForm(next);
                }}
                action={
                  <CommitButton
                    rows={commitRows}
                    destination={destination}
                    emailVerified={emailVerified}
                    loading={itemsLoading}
                    onIssues={handleIssues}
                    onCommitted={handleCommitted}
                    onDone={handleDone}
                  />
                }
              />
            </div>
          ) : null}
        </>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}

function lookupOf(loading: boolean, failed: boolean): ItemsLookup {
  if (loading) return "loading";
  return failed ? "failed" : "found";
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

function orderTitleOf(destination: Destination, newOrderTitle: string): string | null {
  const { ownership } = destination;
  if (ownership?.kind !== "order") return null;
  return ownership.order.kind === "new"
    ? ownership.order.fields.title?.trim() || newOrderTitle
    : (ownership.order.order?.title ?? null);
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
  "Open an item on MyFigureCollection.",
  "Click Pick for myakiba, next to MFC's own buttons.",
  "Come back here and choose where it goes.",
] as const;

function EmptyState() {
  return (
    <Empty className="min-h-0 flex-1 justify-start overflow-y-auto border bg-background/70 pt-16 backdrop-blur-sm dark:bg-background/60">
      <EmptyHeader className="max-w-md">
        <EmptyMedia variant="icon" className={STATE_ICON_CLASS_NAME}>
          <HugeiconsIcon icon={PackageSearchIcon} className="size-5" aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>Pick items on MyFigureCollection</EmptyTitle>
        <EmptyDescription className="text-pretty">
          Picked items wait here until you choose where they go. Or search myakiba above for items
          already in the Item Database.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="max-w-md gap-4">
        <ol className="grid w-full list-none gap-2 text-start text-sm">
          {PICK_STEPS.map((step, index) => (
            <li key={step} className="flex items-baseline gap-2.5">
              <span
                className="flex size-5 shrink-0 translate-y-0.5 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums"
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <span className="min-w-0 text-pretty">{step}</span>
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
        <MissingExtensionNotice copyOf={pickExtensionCopy} className="w-full text-start" />
      </EmptyContent>
    </Empty>
  );
}
