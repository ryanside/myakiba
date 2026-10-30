import { createElement } from "react";
import type { NavigateOptions } from "@tanstack/react-router";
import { toast } from "@/components/ui/toast";
import { itemDestination } from "@/lib/item-destination";
import type { CommitAnswer } from "./commit-button";
import { namedTargets, quoted } from "./commit-input";
import type { ChosenList, Ownership } from "./commit-input";
import { StackedThumbnails } from "./stacked-thumbnails";

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

const itemView = (committed: CommitAnswer["committed"]): ViewAction => {
  const [first, ...rest] = committed;
  if (first === undefined) return { label: "View", target: { to: "/items" } };
  return {
    label: rest.length === 0 ? "View" : "View first item",
    target: itemDestination(first.itemId, first.externalId) as NavigateOptions,
  };
};

const listView = (lists: readonly ChosenList[], label: string): ViewAction | null => {
  const [first, ...rest] = lists;
  if (first === undefined) return null;
  return rest.length === 0
    ? { label, target: { to: "/lists/$listId", params: { listId: first.id } } }
    : { label, target: { to: "/lists" } };
};

/**
 * Where the toast's View goes. `Collection.list` shows only Owned rows, and an Ordered, Paid or
 * Shipped Collection Item outside an Order shows only on its Item's page, so View goes there.
 */
export function commitView(outcome: CommitOutcome): ViewAction {
  const { ownership, answer, wishlist, lists } = outcome;
  const { committed, orderId } = answer;
  switch (ownership.kind) {
    case "collection": {
      if (ownership.shared.status !== "Owned") return itemView(committed);
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
        ? itemView(committed)
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
  const { ownership, orderTitle, wishlist, lists, answer } = outcome;
  const count = answer.committed.length;
  switch (ownership.kind) {
    case "collection":
      return `Added ${count} to your collection`;
    case "order": {
      const title = orderTitle ?? "your Order";
      return ownership.order.kind === "new"
        ? `Created order ${quoted(title)}`
        : `Added ${count} to ${quoted(title)}`;
    }
    case "none": {
      const targets = namedTargets(wishlist ? "your Wishlist" : null, lists);
      if (targets !== null) return `Added ${count} to ${targets}`;
      return count === 1
        ? "This item is in the Item Database"
        : `${count} items are in the Item Database`;
    }
  }
}

export function commitToastDescription(outcome: CommitOutcome): string | undefined {
  const { ownership, wishlist, lists } = outcome;
  const notes: string[] = [];
  if (ownership.kind !== "none") {
    const targets = [
      wishlist ? "on your Wishlist" : null,
      ...lists.map(({ title }) => `in ${quoted(title)}`),
    ]
      .filter((target) => target !== null)
      .join(" and ");
    if (targets !== "") notes.push(`Also ${targets}.`);
  }
  if (ownership.kind === "collection" && ownership.shared.status !== "Owned") {
    notes.push("They show on each Item's page until they are Owned.");
  }
  return notes.length > 0 ? notes.join(" ") : undefined;
}

export function showCommitToast(outcome: CommitOutcome, navigate: Navigate) {
  const view = commitView(outcome);
  const list = commitListView(outcome);
  const go = (target: NavigateOptions) => () => {
    toast.close(id);
    void navigate(target);
  };
  const id = toast.add({
    type: "success",
    title: commitToastTitle(outcome),
    description: commitToastDescription(outcome),
    timeout: 0,
    actionProps: { children: view.label, onClick: go(view.target) },
    data: {
      media: createElement(StackedThumbnails, { items: outcome.answer.committed }),
      ...(list && { secondaryAction: { label: list.label, onClick: go(list.target) } }),
    },
  });
}
