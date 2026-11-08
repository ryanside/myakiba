import { useNavigate, getRouteApi } from "@tanstack/react-router";
import type { NavigateOptions } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "@/components/ui/toast";
import { useRead } from "@/data/client";
import { add, usePickIntake } from "@/data/resources/add";
import { orders } from "@/data/resources/orders";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import type { AddSearch as AddSearchParams } from "@/lib/add-search";
import { pickFailureCopy } from "@/lib/pick-failure";
import { useAddDraft } from "./add-draft";
import type { RowOverrides } from "./add-draft";
import type { CommitAnswer } from "./commit-button";
import {
  defaultOrderTitle,
  destinationOf,
  presetDestination,
  removeButtonId,
} from "./commit-input";
import type { AddItem, CommitIssue, CommitRow, Destination, DestinationForm } from "./commit-input";
import { focusMain, showCommitToast } from "./commit-toast";
import { useRowReleases } from "./row-release";

const appRouteApi = getRouteApi("/(app)");

/** How the read of the rows' Items stands. Only `found` lets a row without one call it gone. */
type ItemsLookup = "loading" | "failed" | "found";

/** Everything the Add page does, with no JSX. */
export function useAddController(search: AddSearchParams) {
  const { session } = appRouteApi.useRouteContext();
  const { emailVerified, email } = session.user;
  const { currency, dateFormat } = useUserPreferences();
  const navigate = useNavigate();
  const { rows, full, dispatch } = useAddDraft(search.item);
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const [searchOpen, setSearchOpen] = useState(Boolean(search.q));
  const [formState, setFormState] = useState<DestinationForm>(() => presetDestination(search.to));
  const [issues, setIssues] = useState<readonly CommitIssue[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const [sending, setSending] = useState(false);
  const settling = useRef(false);

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

  const rowItemIds = rows.map((row) => row.itemId);
  const draftItemIds: ReadonlySet<string> = new Set(rowItemIds);
  const {
    data: itemData,
    isPending: itemsPending,
    isPlaceholderData: itemsStale,
    error: itemsError,
    refetch: refetchItems,
  } = useRead(add.items, rowItemIds);
  const itemsLoading = rowItemIds.length > 0 && (itemsPending || itemsStale);
  const items: ReadonlyMap<string, AddItem> = new Map(
    (itemData?.items ?? []).map((item) => [item.itemId, item]),
  );
  // A failed refresh leaves the Items it already read, so only a row without one needs the error.
  const itemsReadError =
    itemsError !== null && rows.some((row) => !items.has(row.itemId)) ? itemsError : null;
  const lookup = lookupOf(itemsLoading, itemsReadError !== null);

  const presetOrderId =
    formState.order.kind === "existing" && formState.order.order?.title === null
      ? formState.order.order.id
      : null;
  const { data: presetOrder, isError: presetOrderMissing } = useRead(
    orders.detail,
    presetOrderId ?? "",
    { enabled: presetOrderId !== null },
  );
  const resolveOrder = (): DestinationForm["order"] => {
    if (presetOrderId === null) return formState.order;
    if (presetOrderMissing) return { kind: "existing", order: null };
    return presetOrder
      ? { kind: "existing", order: { id: presetOrderId, title: presetOrder.title } }
      : formState.order;
  };
  const resolvedForm: DestinationForm = { ...formState, order: resolveOrder() };
  const destination = destinationOf(resolvedForm);

  const selectedRows = rows.flatMap((row) => {
    const item = items.get(row.itemId);
    return row.selected && item ? [{ row, item }] : [];
  });
  // The draft knows its rows from the first paint, so counting them moves nothing when the Items
  // load. Once the read answers, a row with no Item cannot be committed, so it stops counting.
  const countedRows = itemsLoading ? rows : rows.filter((row) => items.has(row.itemId));
  // A saving pick lands as a selected row, so the page says so from the moment it knows of the pick.
  const savingPicks = intake.rows.filter((pick) => pick.state === "saving").length;
  const rowCount = countedRows.length + savingPicks;
  const selectedCount = countedRows.filter((row) => row.selected).length + savingPicks;
  const hasItems = rows.length + savingPicks > 0;
  // The label counts what is still on its way, so a commit now would leave those out.
  const pending = itemsLoading || savingPicks > 0;
  const commitRows: readonly CommitRow[] = selectedRows.map(({ row, item }) => ({
    row,
    title: item.title,
  }));
  const newOrderTitle = defaultOrderTitle(commitRows.map(({ title }) => title));
  const releaseOf = useRowReleases(rows);
  const failedPicks = intake.rows.filter((pick) => pick.state === "failed").length;
  const unverifiedPick = intake.rows.some(
    (pick) => pick.state === "failed" && pick.reason.kind === "unverified",
  );

  const retryItems = async () => {
    // The read hides this button while it runs, so focus moves before the button goes.
    searchTrigger.current?.focus();
    await refetchItems();
  };

  const select = (itemId: string, selected: boolean) =>
    dispatch({ type: "select", itemId, selected });

  const selectAll = (selected: boolean) => dispatch({ type: "select-all", selected });

  const edit = (itemId: string, overrides: RowOverrides) => {
    setIssues([]);
    dispatch({ type: "edit", itemId, overrides });
  };

  const bulkEdit = (itemIds: readonly string[], overrides: RowOverrides) => {
    setIssues([]);
    for (const itemId of itemIds) dispatch({ type: "edit", itemId, overrides });
  };

  const handleRemove = (itemId: string) => {
    // The document holds the rows in the order on screen, which a sort makes differ from the draft's.
    const buttons = [...document.querySelectorAll<HTMLElement>(`[id^="${removeButtonId("")}"]`)];
    const index = buttons.findIndex(({ id }) => id === removeButtonId(itemId));
    const next = buttons[index + 1] ?? buttons[index - 1];
    // The removed button had focus, so focus moves once the row is gone, not to the page's start.
    flushSync(() => dispatch({ type: "remove", itemIds: [itemId] }));
    (next ?? searchTrigger.current)?.focus();
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
    setFormState(presetDestination(search.to));
    setIssues([]);
    setSending(false);
    settling.current = true;
  };

  // Runs once the commit's rows are gone from the page and from storage. Rows or picks still on the
  // page keep the user here. The page they came from refreshes from what the commit invalidated.
  useEffect(() => {
    if (!settling.current) return;
    settling.current = false;
    if (search.returnTo !== undefined && rows.length === 0 && intake.rows.length === 0) {
      const goBack = async (href: string) => {
        await navigate({ href, replace: true });
        focusMain();
      };
      void goBack(search.returnTo);
      return;
    }
    searchTrigger.current?.focus();
  });

  const committed = (answer: CommitAnswer) => {
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

  const done = () => {
    clearCommitted(commitRows.map(({ row }) => row.itemId));
    const doneItems = selectedRows.map(({ item: { itemId, externalId, title, image } }) => ({
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
        answer: { committed: doneItems, orderId: null, wishlistAdded: 0, listIds: [] },
      },
      navigate,
    );
  };

  const reportIssues = (next: readonly CommitIssue[]) => {
    setIssues(next);
    const [first] = next;
    if (first === undefined) return;
    // A field that holds an issue shows it once the page renders, so focus waits for that.
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[id="${first.fieldId}"]`)?.focus();
    });
  };

  const setForm = (next: DestinationForm) => {
    setIssues([]);
    setFormState(next);
  };

  const addFromSearch = ({
    itemId,
    title,
  }: {
    readonly itemId: string;
    readonly title: string;
  }) => {
    dispatch({ type: "add", itemIds: [itemId] });
    setAnnouncement(`Added ${title}`);
  };

  return {
    email,
    emailVerified,
    currency,
    dateFormat,
    sending,

    rows,
    picks: intake.rows,
    /** The extension has yet to say what picks it holds, on the page a Pick sends the user to. */
    awaitingPicks: search.from === "mfc" && !intake.answered && !hasItems,
    hasItems,
    pending,
    items,
    lookup,
    itemsReadError,
    retryItems,

    resolvedForm,
    setForm,

    selectedRows,
    commitRows,
    countedRows,
    rowCount,
    selectedCount,
    releaseOf,
    newOrderTitle,
    issues,
    announcement,
    handleAnnounce: setAnnouncement,

    select,
    selectAll,
    edit,
    bulkEdit,
    handleRemove,
    handleRetryPick,
    handleDiscardPick,

    full,
    stopped: intake.stopped,
    failedPicks,
    unverifiedPick,
    mfc: search.mfc,

    /** Spread onto `<AddSearch />`. */
    searchProps: {
      initialQuery: search.q ?? "",
      draftItemIds,
      open: searchOpen,
      triggerRef: searchTrigger,
      onOpenChange: setSearchOpen,
      onAdd: addFromSearch,
    },
    /** Spread onto `<CommitButton />`. */
    commitProps: {
      userId: session.user.id,
      rows: commitRows,
      count: selectedCount,
      destination,
      emailVerified,
      loading: pending,
      onIssues: reportIssues,
      onSending: () => setSending(true),
      onFailed: () => setSending(false),
      onCommitted: committed,
      onDone: done,
    },
  };
}

export type AddController = ReturnType<typeof useAddController>;

function lookupOf(loading: boolean, failed: boolean): ItemsLookup {
  if (loading) return "loading";
  return failed ? "failed" : "found";
}

function orderTitleOf(destination: Destination, newOrderTitle: string): string | null {
  const { ownership } = destination;
  if (ownership?.kind !== "order") return null;
  return ownership.order.kind === "new"
    ? ownership.order.fields.title?.trim() || newOrderTitle
    : (ownership.order.order?.title ?? null);
}
