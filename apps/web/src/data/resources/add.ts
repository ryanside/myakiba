import type { MfcItemId } from "@myakiba/mfc/page";
import { Result } from "better-result";
import { useEffect, useEffectEvent, useMemo, useRef, useSyncExternalStore } from "react";
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
 * The Add click. Sending the same choices again after a failed click is a retry of that click, so
 * it keeps its `commitId` and the server answers it at most once. A saved click or new choices
 * start a new commit.
 */
export function useCommitAdd() {
  const commit = useResourceMutation(commitAddCommand);
  const unanswered = useRef<{ readonly choices: string; readonly commitId: string } | null>(null);
  const run = async (choices: AddChoices) => {
    const key = choicesKey(choices);
    const commitId =
      unanswered.current?.choices === key ? unanswered.current.commitId : crypto.randomUUID();
    unanswered.current = { choices: key, commitId };
    const committed = await commit.run({ ...choices, commitId });
    if (committed.isOk()) unanswered.current = null;
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
  return {
    rows,
    stopped,
    retry: (mfcItemId: MfcItemId) => intake.retry(mfcItemId, context),
    discard: intake.discard,
  } as const;
}
