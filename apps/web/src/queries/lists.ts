import type { ListInput, ListOrderInput, ListTarget } from "@myakiba/contracts/lists/schema";
import { app, getErrorMessage } from "@/lib/treaty-client";

export class ListOrderChangedError extends Error {
  override readonly name = "ListOrderChangedError";
}

export async function getLists(limit: number, offset: number) {
  const { data, error } = await app.api.lists.get({ query: { limit, offset } });
  if (error) throw new Error(getErrorMessage(error, "Failed to get lists"));
  return data;
}

export async function createList(input: ListInput) {
  const { data, error } = await app.api.lists.post(input);
  if (error) throw new Error(getErrorMessage(error, "Failed to create list"));
  return data;
}

export async function moveLists(intent: ListOrderInput) {
  const { data, error } = await app.api.lists.order.patch({
    ...intent,
    movedIds: [...intent.movedIds],
  });
  if (error?.status === 404) {
    throw new ListOrderChangedError(getErrorMessage(error, "The List order changed"));
  }
  if (error) throw new Error(getErrorMessage(error, "Failed to move lists"));
  return data;
}

export async function updateList(listId: string, input: ListInput) {
  const { data, error } = await app.api.lists({ listId }).put(input);
  if (error) throw new Error(getErrorMessage(error, "Failed to update list"));
  return data;
}

export async function deleteLists(listIds: readonly string[]): Promise<void> {
  const { error } = await app.api.lists.delete({ listIds: [...listIds] });
  if (error) throw new Error(getErrorMessage(error, "Failed to delete lists"));
}

export async function getList(listId: string) {
  const { data, error } = await app.api.lists({ listId }).get();
  if (error) throw new Error(getErrorMessage(error, "Failed to get list"));
  return data;
}

export async function getListMembers(listId: string, limit: number, offset: number) {
  const { data, error } = await app.api.lists({ listId }).members.get({
    query: { limit, offset },
  });
  if (error) throw new Error(getErrorMessage(error, "Failed to load List"));
  return data;
}

export async function getListOptionsForTargets(targets: readonly ListTarget[]) {
  const { data, error } = await app.api.lists.targets.options.post({
    targets: [...targets],
  });
  if (error) throw new Error(getErrorMessage(error, "Failed to get List options"));
  return data;
}

export async function addTargetsToLists(
  targets: readonly ListTarget[],
  listIds: readonly string[],
) {
  const { data, error } = await app.api.lists.targets.put({
    targets: [...targets],
    listIds: [...listIds],
  });
  if (error) throw new Error(getErrorMessage(error, "Failed to add to Lists"));
  return data;
}

export async function removeTargetsFromList(targets: readonly ListTarget[], listId: string) {
  const { data, error } = await app.api.lists.targets.delete({
    targets: [...targets],
    listId,
  });
  if (error) throw new Error(getErrorMessage(error, "Failed to remove from List"));
  return data;
}

export async function removeListMembers(
  listId: string,
  memberIds: readonly string[],
): Promise<void> {
  const { error } = await app.api.lists({ listId }).members.delete({
    memberIds: [...memberIds],
  });
  if (error) throw new Error(getErrorMessage(error, "Failed to remove from List"));
}

export async function moveListMembers(listId: string, intent: ListOrderInput) {
  const { data, error } = await app.api.lists({ listId }).members.order.patch({
    ...intent,
    movedIds: [...intent.movedIds],
  });
  if (error?.status === 404) {
    throw new ListOrderChangedError(getErrorMessage(error, "The List changed"));
  }
  if (error) throw new Error(getErrorMessage(error, "Failed to save List order"));
  return data;
}
