import type { ListInput, ListTarget } from "@myakiba/contracts/lists/schema";
import type { PositionOrderInput } from "@myakiba/contracts/shared/position-order";
import { call, rejectErr } from "@/data/api";
import { app } from "@/lib/treaty-client";

export async function getLists(limit: number, offset: number) {
  return call(app.api.lists.get({ query: { limit, offset } }), {
    fallback: "Failed to get lists",
  }).then(rejectErr);
}

export async function createList(input: ListInput) {
  return call(app.api.lists.post(input), { fallback: "Failed to create list" }).then(rejectErr);
}

export async function moveLists(intent: PositionOrderInput): Promise<void> {
  await call(
    app.api.lists.order.patch({
      ...intent,
      movedIds: [...intent.movedIds],
    }),
    { fallback: "Failed to move lists" },
  ).then(rejectErr);
}

export async function updateList(listId: string, input: ListInput) {
  return call(app.api.lists({ listId }).put(input), { fallback: "Failed to update list" }).then(
    rejectErr,
  );
}

export async function deleteLists(listIds: readonly string[]): Promise<void> {
  await call(app.api.lists.delete({ listIds: [...listIds] }), {
    fallback: "Failed to delete lists",
  }).then(rejectErr);
}

export async function getList(listId: string) {
  return call(app.api.lists({ listId }).get(), { fallback: "Failed to get list" }).then(rejectErr);
}

export async function getListMembers(listId: string, limit: number, offset: number) {
  return call(
    app.api.lists({ listId }).members.get({
      query: { limit, offset },
    }),
    { fallback: "Failed to load List" },
  ).then(rejectErr);
}

export async function getListOptionsForTargets(targets: readonly ListTarget[]) {
  return call(
    app.api.lists.targets.options.post({
      targets: [...targets],
    }),
    { fallback: "Failed to get List options" },
  ).then(rejectErr);
}

export async function addTargetsToLists(
  targets: readonly ListTarget[],
  listIds: readonly string[],
) {
  return call(
    app.api.lists.targets.put({
      targets: [...targets],
      listIds: [...listIds],
    }),
    { fallback: "Failed to add to Lists" },
  ).then(rejectErr);
}

export async function removeTargetsFromList(targets: readonly ListTarget[], listId: string) {
  return call(
    app.api.lists.targets.delete({
      targets: [...targets],
      listId,
    }),
    { fallback: "Failed to remove from List" },
  ).then(rejectErr);
}

export async function removeListMembers(
  listId: string,
  memberIds: readonly string[],
): Promise<void> {
  await call(
    app.api.lists({ listId }).members.delete({
      memberIds: [...memberIds],
    }),
    { fallback: "Failed to remove from List" },
  ).then(rejectErr);
}

export async function moveListMembers(listId: string, intent: PositionOrderInput): Promise<void> {
  await call(
    app.api.lists({ listId }).members.order.patch({
      ...intent,
      movedIds: [...intent.movedIds],
    }),
    { fallback: "Failed to save List order" },
  ).then(rejectErr);
}
