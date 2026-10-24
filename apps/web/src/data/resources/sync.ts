import { keepPreviousData, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Treaty } from "@elysiajs/eden";
import type {
  SyncSessionItemStatus,
  SyncSessionStatus,
  SyncType,
} from "@myakiba/contracts/shared/types";
import {
  SYNC_SESSION_DETAIL_PAGE_SIZE,
  SYNC_SESSION_SUBGRID_PAGE_SIZE,
} from "@myakiba/contracts/sync/constants";
import { SYNC_STATUS_MESSAGES } from "@myakiba/contracts/sync/messages";
import type { SyncJobStatus } from "@myakiba/contracts/sync/schema";
import { app } from "@/lib/treaty-client";
import { panic } from "better-result";
import type { Result } from "better-result";
import type { ApiFailure } from "../api";
import { call } from "../api";
import {
  fetchSyncSessionDetail,
  fetchSyncSessions,
  retrySyncSession,
  sendCollection,
  sendItemSync,
  sendItems,
  sendOrder,
  sendOrderItems,
} from "@/queries/sync";
import type { SyncResponse } from "@/queries/sync";
import { syncResultFamilies } from "../catalog";
import {
  defineCommand,
  invalidateFamilies,
  rootedRead,
  settle,
  streamedRead,
  useWrite,
} from "../client";
import type { ReadFailure } from "../client";

type JobStatusChunk =
  Treaty.Data<(typeof app.api.sync)["job-status"]["get"]> extends AsyncIterable<infer Chunk>
    ? Chunk
    : never;

type SessionsPage = {
  readonly page: number;
  readonly limit: number;
  readonly status?: SyncSessionStatus[];
  readonly syncType?: SyncType[];
};

type SessionPage = {
  readonly sessionId: string;
  readonly page: number;
  readonly status?: SyncSessionItemStatus[];
};

type JobWatch = {
  readonly jobId: string | null;
  /** Runs when the job ends, once every family a sync changes has refetched. */
  readonly onEnd: (status: SyncJobStatus) => void;
};

const sessionsKey = ({ page, limit, status, syncType }: SessionsPage) =>
  ["syncSessions", page, limit, status, syncType] as const;

const allSessions = { queryKey: ["syncSessions"] } as const;

const RECENT_SESSIONS: SessionsPage = { page: 1, limit: 5 };

export const sync = {
  sessions: rootedRead("syncHistory", {
    key: sessionsKey,
    load: fetchSyncSessions,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  }),
  /** The status widget's latest imports. */
  recentSessions: rootedRead("syncHistory", {
    key: () => sessionsKey(RECENT_SESSIONS),
    load: () => fetchSyncSessions(RECENT_SESSIONS),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  }),
  session: rootedRead("syncHistory", {
    key: ({ sessionId, page, status }: SessionPage) =>
      ["syncSessionDetail", sessionId, page, SYNC_SESSION_DETAIL_PAGE_SIZE, status ?? []] as const,
    load: ({ sessionId, page, status }) =>
      fetchSyncSessionDetail(sessionId, { page, limit: SYNC_SESSION_DETAIL_PAGE_SIZE, status }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  }),
  /** The items under an import history row. */
  sessionItems: rootedRead("syncHistory", {
    key: ({ sessionId, page }: Omit<SessionPage, "status">) =>
      ["syncSessionDetail", sessionId, page, SYNC_SESSION_SUBGRID_PAGE_SIZE] as const,
    load: ({ sessionId, page }) =>
      fetchSyncSessionDetail(sessionId, { page, limit: SYNC_SESSION_SUBGRID_PAGE_SIZE }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  }),
  jobStatus: streamedRead("syncJobStatus", {
    key: ({ jobId }: JobWatch) => ["syncJobStatus", jobId] as const,
    open: async ({ jobId, onEnd }, { signal, client }) => {
      // The read is enabled only with a job, so a null job is a defect.
      if (jobId === null) return panic("jobId is null");
      const opened = await call(
        app.api.sync["job-status"].get({ query: { jobId }, fetch: { signal } }),
        {
          fallback: "Failed to connect to job status stream",
          empty: "No data received from job status stream",
          policy: "fixed",
        },
      );

      async function* withFinishedCheck(
        stream: AsyncIterable<JobStatusChunk>,
      ): AsyncGenerator<JobStatusChunk> {
        for await (const chunk of stream) {
          if (chunk.data.terminalState !== null) {
            await invalidateFamilies(client, syncResultFamilies);
            onEnd(chunk.data);
          }
          yield chunk;
        }
      }

      return opened.map(withFinishedCheck);
    },
    initialValue: ({ jobId }): SyncJobStatus => {
      const now = new Date().toISOString();
      return {
        jobId: jobId ?? "",
        phase: "queued",
        statusMessage: SYNC_STATUS_MESSAGES.connecting,
        progress: null,
        recentItems: [],
        error: null,
        startedAt: now,
        updatedAt: now,
        terminalState: null,
      };
    },
    reducer: (_previous, chunk) => chunk.data,
    retry: false,
  }),
};

/** What each sync sends. A screen sends one through `useSyncSubmit`. */
export const syncSends = {
  item: sendItemSync,
  csv: sendItems,
  order: sendOrder,
  orderItem: sendOrderItems,
  collection: sendCollection,
};

type SubmitFeedback = {
  readonly onSaved: (response: SyncResponse) => void;
  readonly onFailed: (failure: ReadFailure<ApiFailure>) => void;
};

/**
 * Sends a sync without waiting on a refetch. A sync the server finished at once refetches
 * every family a sync changes, and a queued one refetches the import history.
 */
export function useSyncSubmit<Input>(
  send: (input: Input) => Promise<Result<SyncResponse, ApiFailure>>,
  { onSaved, onFailed }: SubmitFeedback,
) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: Input) => settle(() => send(input)),
    onSuccess: (response) => {
      onSaved(response);
      if (response.isFinished) {
        void invalidateFamilies(queryClient, syncResultFamilies);
      } else {
        void queryClient.invalidateQueries(allSessions);
      }
    },
    onError: onFailed,
  });
  const { run, isPending } = useWrite(mutation);
  return { send: run, isPending } as const;
}

export const retrySyncSessionCommand = defineCommand({
  invalidates: ["syncHistory"],
  refetchKeys: (sessionId: string) => [{ queryKey: ["syncSessionDetail", sessionId] }, allSessions],
  persist: retrySyncSession,
  failureTitle: () => "Failed to retry failed item results",
  failureDescription: (_sessionId, error) => error.message,
});
