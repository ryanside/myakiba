import { Elysia, status } from "elysia";
import { evlog } from "evlog/elysia";
import { betterAuth } from "@/middleware/better-auth";
import { tryCatch } from "@myakiba/utils/result";
import { listInputSchema } from "@myakiba/contracts/lists/schema";
import { positionOrderInputSchema } from "@myakiba/contracts/shared/position-order";
import ListsService from "./service";
import {
  listPageQuerySchema,
  listIdParamSchema,
  listOptionsForTargetsSchema,
  addTargetsToListsSchema,
  removeTargetsFromListSchema,
  removeListMembersSchema,
  deleteListsSchema,
} from "./model";

const listsRouter = new Elysia({ prefix: "/lists" })
  .use(betterAuth)
  .use(evlog())
  .get(
    "/",
    async ({ query, user, log }) => {
      log.set({ action: "lists.list", user: { id: user.id } });
      const { data: result, error } = await tryCatch(
        ListsService.getLists(user.id, query.limit, query.offset),
      );

      if (error) {
        log.error(error, { step: "getLists", outcome: "error" });
        return status(500, "Failed to get lists");
      }

      log.set({ lists: { resultCount: result.items.length }, outcome: "success" });
      return {
        ...result,
        items: result.items.map((currentList) => ({
          ...currentList,
          createdAt: currentList.createdAt.toISOString(),
          updatedAt: currentList.updatedAt.toISOString(),
        })),
      };
    },
    { query: listPageQuerySchema, auth: true },
  )
  .post(
    "/",
    async ({ body, user, log }) => {
      log.set({ action: "lists.create", user: { id: user.id } });
      const { data: created, error } = await tryCatch(ListsService.createList(user.id, body));

      if (error) {
        log.error(error, { step: "createList", outcome: "error" });
        return status(500, "Failed to create list");
      }

      log.set({ list: { id: created.id }, outcome: "success" });
      return {
        ...created,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      };
    },
    { body: listInputSchema, auth: true },
  )
  .patch(
    "/order",
    async ({ body, user, log }) => {
      log.set({
        action: "lists.order.move",
        user: { id: user.id },
        listCount: body.movedIds.length,
      });
      const { data: result, error } = await tryCatch(ListsService.moveLists(user.id, body));

      if (error) {
        if (error.message === "LIST_NOT_FOUND") {
          log.set({ outcome: "not_found" });
          return status(404, "List not found");
        }

        log.error(error, { step: "moveLists", outcome: "error" });
        return status(500, "Failed to move lists");
      }

      log.set({ outcome: "success" });
      return result;
    },
    { body: positionOrderInputSchema, auth: true },
  )
  .post(
    "/targets/options",
    async ({ body, user, log }) => {
      log.set({
        action: "lists.targets.options",
        user: { id: user.id },
        targetCount: body.targets.length,
      });
      const { data: lists, error } = await tryCatch(
        ListsService.getListOptionsForTargets(user.id, body.targets),
      );

      if (error) {
        if (error.message === "LIST_TARGET_NOT_FOUND") {
          log.set({ outcome: "not_found" });
          return status(404, "Selection not found");
        }

        log.error(error, { step: "getListOptionsForTargets", outcome: "error" });
        return status(500, "Failed to get List options");
      }

      log.set({ lists: { resultCount: lists.length }, outcome: "success" });
      return { lists };
    },
    { body: listOptionsForTargetsSchema, auth: true },
  )
  .put(
    "/targets",
    async ({ body, user, log }) => {
      log.set({
        action: "lists.targets.add",
        user: { id: user.id },
        targetCount: body.targets.length,
        listCount: body.listIds.length,
      });
      const { data: result, error } = await tryCatch(
        ListsService.addTargetsToLists(user.id, body.targets, body.listIds),
      );

      if (error) {
        if (error.message === "LIST_TARGET_NOT_FOUND" || error.message === "LIST_NOT_FOUND") {
          log.set({ outcome: "not_found" });
          return status(404, "List or selection not found");
        }

        log.error(error, { step: "addTargetsToLists", outcome: "error" });
        return status(500, "Failed to add to Lists");
      }

      log.set({ addedCount: result.addedCount, outcome: "success" });
      return result;
    },
    { body: addTargetsToListsSchema, auth: true },
  )
  .delete(
    "/targets",
    async ({ body, user, log }) => {
      log.set({
        action: "lists.targets.remove",
        user: { id: user.id },
        list: { id: body.listId },
        targetCount: body.targets.length,
      });
      const { data: result, error } = await tryCatch(
        ListsService.removeTargetsFromList(user.id, body.listId, body.targets),
      );

      if (error) {
        if (error.message === "LIST_NOT_FOUND") {
          log.set({ outcome: "not_found" });
          return status(404, "List not found");
        }

        log.error(error, { step: "removeTargetsFromList", outcome: "error" });
        return status(500, "Failed to remove from List");
      }

      log.set({ removedCount: result.removedCount, outcome: "success" });
      return result;
    },
    { body: removeTargetsFromListSchema, auth: true },
  )
  .get(
    "/:listId",
    async ({ params, user, log }) => {
      log.set({ action: "lists.get", user: { id: user.id }, list: { id: params.listId } });
      const { data: result, error } = await tryCatch(ListsService.getList(user.id, params.listId));

      if (error) {
        if (error.message === "LIST_NOT_FOUND") {
          log.set({ outcome: "not_found" });
          return status(404, "List not found");
        }

        log.error(error, { step: "getList", outcome: "error" });
        return status(500, "Failed to get list");
      }

      log.set({ outcome: "success" });
      return {
        ...result,
        createdAt: result.createdAt.toISOString(),
        updatedAt: result.updatedAt.toISOString(),
      };
    },
    { params: listIdParamSchema, auth: true },
  )
  .put(
    "/:listId",
    async ({ params, body, user, log }) => {
      log.set({ action: "lists.update", user: { id: user.id }, list: { id: params.listId } });
      const { data: updated, error } = await tryCatch(
        ListsService.updateList(user.id, params.listId, body),
      );

      if (error) {
        if (error.message === "LIST_NOT_FOUND") {
          log.set({ outcome: "not_found" });
          return status(404, "List not found");
        }

        log.error(error, { step: "updateList", outcome: "error" });
        return status(500, "Failed to update list");
      }

      log.set({ outcome: "success" });
      return {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };
    },
    { params: listIdParamSchema, body: listInputSchema, auth: true },
  )
  .delete(
    "/",
    async ({ body, user, log }) => {
      log.set({
        action: "lists.delete",
        user: { id: user.id },
        listCount: body.listIds.length,
      });
      const { error } = await tryCatch(ListsService.deleteLists(user.id, body.listIds));

      if (error) {
        if (error.message === "LIST_NOT_FOUND") {
          log.set({ outcome: "not_found" });
          return status(404, "List not found");
        }

        log.error(error, { step: "deleteLists", outcome: "error" });
        return status(500, "Failed to delete lists");
      }

      log.set({ outcome: "success" });
      return { deletedCount: body.listIds.length };
    },
    { body: deleteListsSchema, auth: true },
  )
  .delete(
    "/:listId/members",
    async ({ params, body, user, log }) => {
      log.set({
        action: "lists.members.remove",
        user: { id: user.id },
        list: { id: params.listId },
        memberCount: body.memberIds.length,
      });
      const { data: result, error } = await tryCatch(
        ListsService.removeMembers(user.id, params.listId, body.memberIds),
      );

      if (error) {
        if (error.message === "LIST_MEMBER_NOT_FOUND") {
          log.set({ outcome: "not_found" });
          return status(404, "Selection not found");
        }

        log.error(error, { step: "removeMembers", outcome: "error" });
        return status(500, "Failed to remove from List");
      }

      log.set({ removedCount: result.removedCount, outcome: "success" });
      return result;
    },
    { params: listIdParamSchema, body: removeListMembersSchema, auth: true },
  )
  .get(
    "/:listId/members",
    async ({ params, query, user, log }) => {
      log.set({
        action: "lists.members.list",
        user: { id: user.id },
        list: { id: params.listId },
      });
      const { data: result, error } = await tryCatch(
        ListsService.getListMembers(user.id, params.listId, query.limit, query.offset),
      );

      if (error) {
        if (error.message === "LIST_NOT_FOUND") {
          log.set({ outcome: "not_found" });
          return status(404, "List not found");
        }

        log.error(error, { step: "getListMembers", outcome: "error" });
        return status(500, "Failed to load List");
      }

      log.set({ lists: { resultCount: result.items.length }, outcome: "success" });
      return result;
    },
    { params: listIdParamSchema, query: listPageQuerySchema, auth: true },
  )
  .patch(
    "/:listId/members/order",
    async ({ params, body, user, log }) => {
      log.set({
        action: "lists.members.order.move",
        user: { id: user.id },
        list: { id: params.listId },
        memberCount: body.movedIds.length,
      });
      const { data: result, error } = await tryCatch(
        ListsService.moveMembers(user.id, params.listId, body),
      );

      if (error) {
        if (error.message === "LIST_NOT_FOUND" || error.message === "LIST_MEMBER_NOT_FOUND") {
          log.set({ outcome: "not_found" });
          return status(404, "List or selection not found");
        }

        log.error(error, { step: "moveMembers", outcome: "error" });
        return status(500, "Failed to save List order");
      }

      log.set({ outcome: "success" });
      return result;
    },
    { params: listIdParamSchema, body: positionOrderInputSchema, auth: true },
  );

export default listsRouter;
