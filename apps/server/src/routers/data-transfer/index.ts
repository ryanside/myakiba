import { Elysia, sse, status } from "elysia";
import { evlog } from "evlog/elysia";
import {
  DATA_TRANSFER_MAX_RECORDS,
  dataTransferImportRequestSchema,
} from "@myakiba/contracts/data-transfer/schema";
import { tryCatch } from "@myakiba/utils/result";
import { betterAuth } from "@/middleware/better-auth";
import { jobStatusSubscriptionRegistry } from "@/lib/job-status-subscription-registry";
import {
  MAX_JOB_STATUS_STREAM_DURATION_MS,
  waitForNextJobStatusEvent,
} from "@/lib/job-status-stream";
import DataTransferService from "./service";

const dataTransferRouter = new Elysia({ prefix: "/data-transfer" })
  .use(betterAuth)
  .use(evlog())
  .get(
    "/export",
    async ({ user, log }) => {
      log.set({
        action: "dataTransfer.export",
        user: { id: user.id },
      });

      const { data: archive, error } = await tryCatch(DataTransferService.exportArchive(user.id));

      if (error) {
        if (error.message === "DATA_TRANSFER_ARCHIVE_EMPTY") {
          log.set({
            outcome: "rejected",
            dataTransfer: { code: error.message },
          });
          return status(409, "There is no data to export.");
        }
        if (error.message === "DATA_TRANSFER_ARCHIVE_TOO_LARGE") {
          log.set({
            outcome: "rejected",
            dataTransfer: { code: error.message },
          });
          return status(413, "The export exceeds the 50 MiB limit.");
        }
        if (error.message === "DATA_TRANSFER_ARCHIVE_TOO_MANY_RECORDS") {
          log.set({
            outcome: "rejected",
            dataTransfer: { code: error.message },
          });
          return status(413, `The export exceeds the ${DATA_TRANSFER_MAX_RECORDS} record limit.`);
        }
        if (error.message === "DATA_TRANSFER_UNSUPPORTED_COLLECTION_ITEM") {
          log.set({
            outcome: "rejected",
            dataTransfer: { code: error.message },
          });
          return status(
            409,
            "Data transfer only supports MyFigureCollection-backed collection items.",
          );
        }

        log.error(error, { step: "exportArchive", outcome: "error" });
        return status(500, "Failed to export data.");
      }

      log.set({
        outcome: "success",
        dataTransfer: {
          exportId: archive.exportId,
          orders: archive.orders.length,
          collectionItems: archive.collectionItems.length,
        },
      });
      return archive;
    },
    { auth: true },
  )
  .get(
    "/imports/current",
    async ({ user, log }) => {
      log.set({
        action: "dataTransfer.getCurrentImport",
        user: { id: user.id },
      });

      const { data: currentImport, error } = await tryCatch(
        DataTransferService.getCurrentImport(user.id),
      );

      if (error) {
        log.error(error, { step: "getCurrentImport", outcome: "error" });
        return status(500, "Failed to check import status.");
      }

      log.set({
        outcome: "success",
        dataTransfer: { importId: currentImport?.id ?? null },
      });
      return currentImport;
    },
    { auth: true },
  )
  .delete(
    "/imports/current",
    async ({ user, log }) => {
      log.set({
        action: "dataTransfer.deleteCurrentImport",
        user: { id: user.id },
      });

      const { data: result, error } = await tryCatch(
        DataTransferService.deleteCurrentImport(user.id),
      );

      if (error) {
        log.error(error, { step: "deleteCurrentImport", outcome: "error" });
        return status(500, "Failed to delete the import session.");
      }
      if (result.kind === "active") {
        log.set({ outcome: "rejected" });
        return status(409, "An active import cannot be deleted.");
      }
      if (result.kind === "not_found") {
        log.set({ outcome: "not_found" });
        return status(404, "No inactive import session was found.");
      }

      log.set({
        outcome: "success",
        dataTransfer: { importId: result.id },
      });
      return { id: result.id };
    },
    { auth: true },
  )
  .get(
    "/imports/current/status",
    async function* ({ user, log, request }) {
      log.set({
        action: "dataTransfer.importStatus",
        user: { id: user.id },
      });

      const streamStartedAt = Date.now();
      const abortPromise = request.signal.aborted
        ? Promise.resolve<"aborted">("aborted")
        : new Promise<"aborted">((resolve) => {
            request.signal.addEventListener("abort", () => resolve("aborted"), { once: true });
          });

      const { data: initialStatus, error: initialStatusError } = await tryCatch(
        DataTransferService.getImportJobStatus(user.id),
      );

      if (initialStatusError) {
        log.error(initialStatusError, { step: "getImportJobStatus", outcome: "error" });
        return;
      }
      if (initialStatus === null) {
        log.set({ outcome: "not_found" });
        return;
      }

      yield sse({ data: initialStatus });
      if (initialStatus.terminalState !== null) {
        log.set({ outcome: initialStatus.terminalState });
        return;
      }

      const { data: subscription, error: subscriptionError } = await tryCatch(
        jobStatusSubscriptionRegistry.subscribe(initialStatus.jobId),
      );
      if (subscriptionError) {
        log.error(subscriptionError, { step: "subscribeImportStatus", outcome: "error" });
        return;
      }

      try {
        const { data: replayStatus, error: replayStatusError } = await tryCatch(
          DataTransferService.getImportJobStatus(user.id),
        );
        if (replayStatusError) {
          log.error(replayStatusError, { step: "replayImportStatus", outcome: "error" });
          return;
        }
        if (replayStatus === null) {
          log.set({ outcome: "not_found" });
          return;
        }

        if (
          initialStatus.phase !== replayStatus.phase ||
          initialStatus.statusMessage !== replayStatus.statusMessage ||
          initialStatus.updatedAt !== replayStatus.updatedAt ||
          initialStatus.terminalState !== replayStatus.terminalState
        ) {
          yield sse({ data: replayStatus });
        }
        if (replayStatus.terminalState !== null) {
          log.set({ outcome: replayStatus.terminalState });
          return;
        }

        let latestStatus = replayStatus;
        let subscriptionEventPromise = subscription.next();

        while (true) {
          const remainingMs = MAX_JOB_STATUS_STREAM_DURATION_MS - (Date.now() - streamStartedAt);
          if (remainingMs <= 0) {
            log.set({ outcome: "timeout" });
            return;
          }

          const nextEvent = await waitForNextJobStatusEvent({
            subscriptionEventPromise,
            abortPromise,
            remainingMs,
          });

          if (nextEvent.kind === "aborted") return;
          if (nextEvent.kind === "timeout") {
            log.set({ outcome: "timeout" });
            return;
          }
          if (nextEvent.kind === "heartbeat") {
            yield sse({ data: latestStatus });
            continue;
          }
          if (nextEvent.event.kind === "error") {
            log.error(nextEvent.event.error, {
              step: "importStatusSubscription",
              outcome: "error",
            });
            return;
          }

          latestStatus = nextEvent.event.status;
          yield sse({ data: latestStatus });
          if (latestStatus.terminalState !== null) {
            log.set({ outcome: latestStatus.terminalState });
            return;
          }

          subscriptionEventPromise = subscription.next();
        }
      } finally {
        await subscription.unsubscribe();
      }
    },
    {
      auth: true,
    },
  )
  .post(
    "/imports",
    async ({ body, user, log }) => {
      log.set({
        action: "dataTransfer.startImport",
        user: { id: user.id },
        dataTransfer: {
          exportId: body.archive.exportId,
          orders: body.archive.orders.length,
          collectionItems: body.archive.collectionItems.length,
        },
      });

      const { data: currentImport, error } = await tryCatch(
        DataTransferService.startImport({
          userId: user.id,
          fileName: body.fileName,
          archive: body.archive,
        }),
      );

      if (error) {
        if (error.message === "DATA_TRANSFER_ARCHIVE_TOO_LARGE") {
          log.set({
            outcome: "rejected",
            dataTransfer: { code: error.message },
          });
          return status(413, "The import archive exceeds the 50 MiB limit.");
        }
        if (error.message === "DATA_TRANSFER_ACTIVE_IMPORT") {
          log.set({
            outcome: "rejected",
            dataTransfer: { code: error.message },
          });
          return status(409, "Another data import is already active.");
        }

        log.error(error, { step: "startImport", outcome: "error" });
        if (error.message === "DATA_TRANSFER_QUEUE_UNAVAILABLE") {
          return status(
            500,
            "The import could not be queued. Retry it when the queue is available.",
          );
        }
        return status(500, "Failed to start import.");
      }

      log.set({
        outcome: "success",
        dataTransfer: {
          importId: currentImport.id,
          status: currentImport.status,
        },
      });
      return currentImport;
    },
    {
      auth: true,
      body: dataTransferImportRequestSchema,
    },
  )
  .post(
    "/imports/current/retry",
    async ({ user, log }) => {
      log.set({
        action: "dataTransfer.retryImport",
        user: { id: user.id },
      });

      const { data: currentImport, error } = await tryCatch(
        DataTransferService.retryImport(user.id),
      );

      if (error) {
        if (error.message === "DATA_TRANSFER_IMPORT_NOT_RETRYABLE") {
          log.set({
            outcome: "rejected",
            dataTransfer: { code: error.message },
          });
          return status(
            409,
            "The import does not exist or cannot be retried in its current state.",
          );
        }

        log.error(error, { step: "retryImport", outcome: "error" });
        if (error.message === "DATA_TRANSFER_QUEUE_UNAVAILABLE") {
          return status(
            500,
            "The import could not be queued. Retry it when the queue is available.",
          );
        }
        return status(500, "Failed to retry import.");
      }

      log.set({
        outcome: "success",
        dataTransfer: {
          importId: currentImport.id,
          status: currentImport.status,
        },
      });
      return currentImport;
    },
    {
      auth: true,
    },
  );

export default dataTransferRouter;
