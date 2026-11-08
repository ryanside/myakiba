import type { ListInput, ListTarget } from "@myakiba/contracts/lists/schema";
import type { PositionOrderInput } from "@myakiba/contracts/shared/position-order";
import { call } from "@/data/api";
import { app } from "@/lib/treaty-client";

export function getLists(limit: number, offset: number) {
  return call(app.api.lists.get({ query: { limit, offset } }), {
    fallback: "Failed to get lists",
    empty: "Failed to get lists",
  });
}

export function createList(input: ListInput) {
  return call(app.api.lists.post(input), {
    fallback: "Failed to create list",
    empty: "Failed to create list",
  });
}

export function moveLists(intent: PositionOrderInput) {
  return call(
    app.api.lists.order.patch({
      ...intent,
      movedIds: [...intent.movedIds],
    }),
    { fallback: "Failed to move lists" },
  );
}

export function updateList(listId: string, input: ListInput) {
  return call(app.api.lists({ listId }).put(input), { fallback: "Failed to update list" });
}

export function deleteLists(listIds: readonly string[]) {
  return call(app.api.lists.delete({ listIds: [...listIds] }), {
    fallback: "Failed to delete lists",
  });
}

export function getList(listId: string) {
  return call(app.api.lists({ listId }).get(), {
    fallback: "Failed to get list",
    empty: "Failed to get list",
  });
}

export function getListMembers(listId: string, limit: number, offset: number) {
  return call(
    app.api.lists({ listId }).members.get({
      query: { limit, offset },
    }),
    { fallback: "Failed to load List", empty: "Failed to load List" },
  );
}

export function getListOptionsForTargets(targets: readonly ListTarget[]) {
  return call(
    app.api.lists.targets.options.post({
      targets: [...targets],
    }),
    { fallback: "Failed to get List options", empty: "Failed to get List options" },
  );
}

export function addTargetsToLists(targets: readonly ListTarget[], listIds: readonly string[]) {
  return call(
    app.api.lists.targets.put({
      targets: [...targets],
      listIds: [...listIds],
    }),
    { fallback: "Failed to add to Lists" },
  );
}

export function removeTargetsFromList(targets: readonly ListTarget[], listId: string) {
  return call(
    app.api.lists.targets.delete({
      targets: [...targets],
      listId,
    }),
    { fallback: "Failed to remove from List" },
  );
}

export function removeListMembers(listId: string, memberIds: readonly string[]) {
  return call(
    app.api.lists({ listId }).members.delete({
      memberIds: [...memberIds],
    }),
    { fallback: "Failed to remove from List" },
  );
}

export function moveListMembers(listId: string, intent: PositionOrderInput) {
  return call(
    app.api.lists({ listId }).members.order.patch({
      ...intent,
      movedIds: [...intent.movedIds],
    }),
    { fallback: "Failed to save List order" },
  );
}
