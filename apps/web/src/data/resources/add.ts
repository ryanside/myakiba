import type { MfcItemId } from "@myakiba/mfc/page";
import { Result } from "better-result";
import { useEffect, useEffectEvent, useMemo, useSyncExternalStore } from "react";
import * as z from "zod";
import { accountSlot } from "@/lib/account-storage";
import { ApiRejected } from "@/lib/errors/api-rejected";
import { extensionBridge } from "@/lib/extension-bridge";
import type { TakenPick } from "@/lib/extension-bridge";
import { pickFailureOf } from "@/lib/pick-failure";
import { app } from "@/lib/treaty-client";
import { call } from "../api";
import type { ApiFailure } from "../api";
import { collectionWriteFamilies } from "../catalog";
import { defineCommand, rootedRead, useResourceMutation } from "../client";
import { createPickIntake } from "../picks";
import type { PickContext } from "../picks";
import { inUploadSlot } from "../upload-slots";
import { searches } from "./search";

type AddCommit = Parameters<typeof app.api.add.commit.post>[0];

/** What the Add page chose. Each Add click gets its own `commitId`. */
export type AddChoices = Omit<AddCommit, "commitId">;

const COMMIT_BUSY = "You've added a lot of items this hour. Try again in a few minutes.";

export const add = {
  /** Row details and badges for the draft's Items. Ids the server no longer has are left out. */
  items: rootedRead("itemDatabase", {
    key: (itemIds: readonly string[]) => ["item-database-items", "add", itemIds] as const,
    load: async (itemIds: readonly string[]) =>
      itemIds.length === 0
        ? Result.ok({ items: [] })
        : call(app.api.add.items.get({ query: { ids: [...itemIds] } }), {
            fallback: "Failed to load the items to add",
          }),
    // Rows already on the page keep their pictures while a new row's summary loads.
    keepPrevious: () => true,
  }),
  search: searches.itemDatabase,
};

/** The commit's own text for a server answer, except that a full hourly budget gets Add's wording. */
function commitFailureText(failure: ApiFailure): string {
  return ApiRejected.is(failure) && failure.status === 429 ? COMMIT_BUSY : failure.message;
}

const commitAddCommand = defineCommand({
  invalidates: ["wishlist", ...collectionWriteFamilies],
  persist: (commit: AddCommit) =>
    call(app.api.add.commit.post(commit), {
      fallback: "myakiba could not add these items. Try again.",
    }),
  failureToast: (_commit, failure) => ({
    title: "Failed to add the items",
    // The rows wait on this page for a retry, so what went wrong stays until it's dismissed.
    timeout: 0,
    ...(failure && { description: commitFailureText(failure) }),
  }),
});

/** Reads the same for the same choices, whatever order their properties were built in. */
function choicesKey(choices: AddChoices): string {
  const keys = new Set<string>();
  JSON.stringify(choices, (key, value) => {
    keys.add(key);
    return value;
  });
  // An array replacer writes only those keys, in that order, at every depth.
  return JSON.stringify(choices, [...keys].toSorted());
}

/**
 * How long a retry keeps an unanswered commit's `commitId`, from its first send. The server answers
 * an id at most once for 10 minutes from when it first sees it, then writes again for it as for a
 * new id, so an older id is worth no more than a new one. The spare minute is for the retry's trip.
 */
const RETRY_WINDOW_MS = 9 * 60 * 1000;

/** The last click that got no answer, so a retry after a reload is still that click. */
const unansweredCommit = accountSlot(
  "add-commit",
  z.object({ choices: z.string(), commitId: z.uuid(), expiresAt: z.number() }),
);

/**
 * The Add click. Sending the same choices again after a click that got no answer is a retry of
 * that click, after a reload too, so it keeps its `commitId` and the server answers it at most
 * once. A saved click, new choices or the end of the retry window start a new commit.
 */
export function useCommitAdd(userId: string) {
  const commit = useResourceMutation(commitAddCommand);
  const run = async (choices: AddChoices) => {
    const key = choicesKey(choices);
    const now = Date.now();
    const unanswered = unansweredCommit.read(userId);
    const sent =
      unanswered?.choices === key && unanswered.expiresAt > now
        ? unanswered
        : { choices: key, commitId: crypto.randomUUID(), expiresAt: now + RETRY_WINDOW_MS };
    unansweredCommit.write(userId, sent);
    const committed = await commit.run({ ...choices, commitId: sent.commitId });
    if (committed.isOk()) unansweredCommit.clear();
    return committed;
  };
  return { run, isPending: commit.isPending } as const;
}

const savePickCommand = defineCommand({
  invalidates: ["itemDatabase"],
  refetchBy: "background",
  persist: ({ mfcItemId, page, picture }: TakenPick) =>
    inUploadSlot(() =>
      call(
        app.api["mfc-items"].post(picture ? { mfcItemId, page, picture } : { mfcItemId, page }),
        { fallback: "myakiba could not save this item." },
      ),
    ),
});

/** Pulls the extension's picks while this tab shows and saves each into the Item Database. */
export function usePickIntake({
  emailVerified,
  onSaved,
}: {
  readonly emailVerified: boolean;
  /** Adds the saved Items to the draft. */
  readonly onSaved: (itemIds: readonly string[]) => void;
}) {
  const savePick = useResourceMutation(savePickCommand);
  const intake = useMemo(
    () =>
      createPickIntake({
        bridge: extensionBridge,
        // Browsers leave Web Locks out of insecure contexts.
        locks: navigator.locks ?? undefined,
        visible: () => document.visibilityState === "visible",
      }),
    [],
  );
  const context: PickContext = {
    emailVerified,
    onSaved,
    save: async (pick) => {
      const saved = await savePick.run(pick);
      return saved.mapError((failed) => pickFailureOf(failed.cause));
    },
  };
  // A pull never rejects, so starting it from a listener loses nothing.
  const pull = useEffectEvent(() => {
    void intake.pull(context);
  });
  useEffect(() => {
    pull();
    window.addEventListener("focus", pull);
    document.addEventListener("visibilitychange", pull);
    return () => {
      window.removeEventListener("focus", pull);
      document.removeEventListener("visibilitychange", pull);
    };
  }, []);
  const rows = useSyncExternalStore(intake.subscribe, intake.rows);
  const stopped = useSyncExternalStore(intake.subscribe, intake.stopped);
  const answered = useSyncExternalStore(intake.subscribe, intake.answered);
  return {
    rows,
    stopped,
    answered,
    retry: (mfcItemId: MfcItemId) => intake.retry(mfcItemId, context),
    discard: intake.discard,
  } as const;
}
