import { Image01Icon, PackageIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { NavigateOptions } from "@tanstack/react-router";
import { createElement } from "react";
import { ImageThumbnail } from "@/components/ui/image-thumbnail";
import { toast } from "@/components/ui/toast";
import { itemDestination } from "@/lib/item-destination";
import type { CommitAnswer } from "./commit-button";
import { namedTargets, quoted } from "./commit-input";
import type { ChosenList, Ownership } from "./commit-input";

type Navigate = (target: NavigateOptions) => void | Promise<void>;

export type CommitOutcome = {
  readonly ownership: Ownership;
  /** The title the new Order got, or the existing Order's. */
  readonly orderTitle: string | null;
  readonly wishlist: boolean;
  readonly lists: readonly ChosenList[];
  readonly answer: CommitAnswer;
};

export type ViewAction = { readonly label: string; readonly target: NavigateOptions };

const listView = (lists: readonly ChosenList[], label: string): ViewAction | null => {
  const [first, ...rest] = lists;
  if (first === undefined) return null;
  return rest.length === 0
    ? { label, target: { to: "/lists/$listId", params: { listId: first.id } } }
    : { label, target: { to: "/lists" } };
};

/** Where the toast's View goes. */
export function commitView(outcome: CommitOutcome): ViewAction {
  const { ownership, answer, wishlist, lists } = outcome;
  const { committed, orderId } = answer;
  switch (ownership.kind) {
    case "collection": {
      const ids = committed.flatMap(({ collectionId }) => (collectionId ? [collectionId] : []));
      return { label: "View", target: { to: "/collection", search: { ids } } };
    }
    case "order":
      return orderId === null
        ? { label: "View", target: { to: "/orders" } }
        : { label: "View", target: { to: "/orders/$id", params: { id: orderId } } };
    case "none": {
      if (wishlist) return { label: "View", target: { to: "/wishlist" } };
      const list = listView(lists, "View");
      if (list !== null) return list;
      const [first, ...rest] = committed;
      return first !== undefined && rest.length === 0
        ? {
            label: "View",
            target: itemDestination(first.itemId, first.externalId) as NavigateOptions,
          }
        : { label: "View", target: { to: "/items" } };
    }
  }
}

/** A second action for the List, unless View already goes there. */
export function commitListView(outcome: CommitOutcome): ViewAction | null {
  const { ownership, wishlist, lists } = outcome;
  if (ownership.kind === "none" && !wishlist) return null;
  return listView(lists, lists.length === 1 ? "View list" : "View lists");
}

export function commitToastTitle(outcome: CommitOutcome): string {
  const { ownership, wishlist, lists, answer } = outcome;
  const count = answer.committed.length;
  switch (ownership.kind) {
    case "collection":
      return `Added ${count} to your collection`;
    case "order":
      return ownership.order.kind === "new" ? "Created order" : `Added ${count} to order`;
    case "none": {
      const targets = namedTargets(wishlist ? "your Wishlist" : null, lists);
      if (targets !== null) return `Added ${count} to ${targets}`;
      return count === 1
        ? "This item is in the Item Database"
        : `${count} items are in the Item Database`;
    }
  }
}

/** The Order's name, then anywhere else the Items went, each on its own line. */
export function commitToastDescription(outcome: CommitOutcome): string | undefined {
  const { ownership, orderTitle, wishlist, lists } = outcome;
  if (ownership.kind === "none") return undefined;
  const targets = [
    wishlist ? "on your Wishlist" : null,
    ...lists.map(({ title }) => `in ${quoted(title)}`),
  ]
    .filter((target) => target !== null)
    .join(" and ");
  const lines = [
    ownership.kind === "order" ? orderTitle : null,
    targets === "" ? null : `Also ${targets}.`,
  ].filter((line) => line !== null);
  return lines.length === 0 ? undefined : lines.join("\n");
}

/** After a route change, so the next Tab starts in the new page and not at the document's top. */
export function focusMain() {
  document.querySelector<HTMLElement>("main")?.focus({ preventScroll: true });
}

export function showCommitToast(outcome: CommitOutcome, navigate: Navigate) {
  const view = commitView(outcome);
  const list = commitListView(outcome);
  const go = (target: NavigateOptions) => async () => {
    toast.close(id);
    await navigate(target);
    focusMain();
  };
  const id = toast.add({
    type: "success",
    title: commitToastTitle(outcome),
    description: commitToastDescription(outcome),
    actionProps: { children: view.label, onClick: go(view.target) },
    data: {
      media: createElement(ImageThumbnail, {
        images: outcome.answer.committed.flatMap(({ image }) => (image ? [image] : [])),
        title: commitToastTitle(outcome),
        decorative: true,
        showRemainingCount: true,
        className:
          "size-12 shrink-0 rounded-lg outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10",
        fallbackIcon: createElement(HugeiconsIcon, {
          icon: outcome.ownership.kind === "order" ? PackageIcon : Image01Icon,
          className: "size-5 text-muted-foreground",
          "aria-hidden": true,
        }),
      }),
      ...(list && { secondaryAction: { label: list.label, onClick: go(list.target) } }),
    },
  });
}
