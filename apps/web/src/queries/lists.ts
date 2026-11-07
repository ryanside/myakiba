import { requireData, checkResponse } from "@/lib/api-response";
import type { ListInput, ListTarget } from "@myakiba/contracts/lists/schema";
import type { PositionOrderInput } from "@myakiba/contracts/shared/position-order";
import { app } from "@/lib/treaty-client";

export async function getLists(limit: number, offset: number) {
  return requireData(app.api.lists.get({ query: { limit, offset } }), "Failed to get lists");
}

export async function createList(input: ListInput) {
  return requireData(app.api.lists.post(input), "Failed to create list");
}

export async function moveLists(intent: PositionOrderInput): Promise<void> {
  await checkResponse(
    app.api.lists.order.patch({ ...intent, movedIds: [...intent.movedIds] }),
    "Failed to move lists",
  );
}

export async function updateList(listId: string, input: ListInput) {
  return checkResponse(app.api.lists({ listId }).put(input), "Failed to update list");
}

export async function deleteLists(listIds: readonly string[]): Promise<void> {
  await checkResponse(app.api.lists.delete({ listIds: [...listIds] }), "Failed to delete lists");
}

export async function getList(listId: string) {
  return requireData(app.api.lists({ listId }).get(), "Failed to get list");
}

export async function getListMembers(listId: string, limit: number, offset: number) {
  return requireData(
    app.api.lists({ listId }).members.get({ query: { limit, offset } }),
    "Failed to load List",
  );
}

export async function getListOptionsForTargets(targets: readonly ListTarget[]) {
  return requireData(
    app.api.lists.targets.options.post({ targets: [...targets] }),
    "Failed to get List options",
  );
}

export async function addTargetsToLists(
  targets: readonly ListTarget[],
  listIds: readonly string[],
) {
  return checkResponse(
    app.api.lists.targets.put({ targets: [...targets], listIds: [...listIds] }),
    "Failed to add to Lists",
  );
}

export async function removeTargetsFromList(targets: readonly ListTarget[], listId: string) {
  return checkResponse(
    app.api.lists.targets.delete({ targets: [...targets], listId }),
    "Failed to remove from List",
  );
}

export async function removeListMembers(
  listId: string,
  memberIds: readonly string[],
): Promise<void> {
  await checkResponse(
    app.api.lists({ listId }).members.delete({ memberIds: [...memberIds] }),
    "Failed to remove from List",
  );
}

export async function moveListMembers(listId: string, intent: PositionOrderInput): Promise<void> {
  await checkResponse(
    app.api.lists({ listId }).members.order.patch({ ...intent, movedIds: [...intent.movedIds] }),
    "Failed to save List order",
  );
}
