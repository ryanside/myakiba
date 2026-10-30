import { describe, expect, test } from "bun:test";
import { mfcItemId } from "@myakiba/mfc/page";
import type { MfcItemId } from "@myakiba/mfc/page";
import { Result } from "better-result";
import { createExtensionBridge } from "@/lib/extension-bridge";
import type { TakenPick } from "@/lib/extension-bridge";
import type { PickFailure } from "@/lib/pick-failure";
import { fakeExtension, fakePick } from "../../test/fake-extension";
import type { FakePick } from "../../test/fake-extension";
import { createPickIntake } from "./picks";

type Saved = Result<{ readonly itemId: string }, PickFailure>;

function id(value: number): MfcItemId {
  const parsed = mfcItemId(value);
  if (parsed === null) throw new Error(`${value} is no MFC item id`);
  return parsed;
}

const savedAs = (pick: TakenPick): Saved => Result.ok({ itemId: `item-${pick.mfcItemId}` });

type Granted = (lock: Lock | null) => Promise<void>;

/** One lock, like `navigator.locks`: a request waits its turn unless it asks `ifAvailable`. */
function fakeLocks() {
  let last: Promise<void> = Promise.resolve();
  let holders = 0;
  return {
    request: async (
      name: string,
      ...args: [Granted] | [{ readonly ifAvailable: true }, Granted]
    ): Promise<void> => {
      const granted = args.length === 1 ? args[0] : args[1];
      if (args.length === 2 && holders > 0) return granted(null);
      holders += 1;
      const turn = last.then(() => granted({ name, mode: "exclusive" }));
      last = turn.finally(() => {
        holders -= 1;
      });
      return turn;
    },
  };
}

function deferred<Value>() {
  let release: (value: Value) => void = () => {};
  const promise = new Promise<Value>((resolve) => {
    release = resolve;
  });
  return { promise, resolve: release };
}

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const until = async (done: () => boolean) => {
  while (!done()) {
    await new Promise((resolve) => {
      setTimeout(resolve, 1);
    });
  }
};

function tab({
  extension,
  locks = fakeLocks(),
  save = async (pick: TakenPick) => savedAs(pick),
}: {
  readonly extension: ReturnType<typeof fakeExtension>;
  readonly locks?: ReturnType<typeof fakeLocks> | undefined;
  readonly save?: (pick: TakenPick) => Promise<Saved>;
}) {
  const shown = { visible: true, verified: true };
  const uploads: number[] = [];
  const draft: string[] = [];
  const intake = createPickIntake({
    bridge: createExtensionBridge(extension.window, { picksAnswerMs: 50 }),
    locks,
    visible: () => shown.visible,
  });
  const context = () => ({
    emailVerified: shown.verified,
    onSaved: (itemIds: readonly string[]) => draft.push(...itemIds),
    save: (pick: TakenPick) => {
      uploads.push(pick.mfcItemId);
      return save(pick);
    },
  });
  return {
    intake: {
      ...intake,
      pull: () => intake.pull(context()),
      retry: (pickId: MfcItemId) => intake.retry(pickId, context()),
    },
    shown,
    uploads,
    draft,
  };
}

const picked = (...picks: FakePick[]) => fakeExtension({ picks });

const repick = (pick: FakePick, html: string, title = pick.title): FakePick => ({
  ...pick,
  html,
  title,
});

describe("pulling picks", () => {
  test("saves each pick, adds its Item to the draft and reports the saved picks", async () => {
    const extension = picked(fakePick(1), fakePick(2));
    const { intake, uploads, draft } = tab({ extension });

    await intake.pull();

    expect(uploads).toEqual([1, 2]);
    expect(draft).toEqual(["item-1", "item-2"]);
    expect(extension.acknowledged).toEqual([{ type: "picks-saved", mfcItemIds: [1, 2] }]);
    expect(extension.picks()).toEqual([]);
    expect(intake.rows()).toEqual([]);
  });

  test("asks for nothing while the tab is hidden", async () => {
    const extension = picked(fakePick(1));
    const { intake, shown, uploads } = tab({ extension });
    shown.visible = false;

    await intake.pull();

    expect(extension.takes()).toBe(0);
    expect(uploads).toEqual([]);
  });

  test("a second tab does nothing while the first holds the picks lock, and uploads nothing it saved", async () => {
    const extension = picked(fakePick(1));
    const locks = fakeLocks();
    const holding = deferred<Saved>();
    const first = tab({ extension, locks, save: () => holding.promise });
    const second = tab({ extension, locks });

    const pulling = first.intake.pull();
    await until(() => first.uploads.length === 1);
    const secondPulling = second.intake.pull();
    await sleep(20);
    const takesWhileHeld = extension.takes();
    holding.resolve(Result.ok({ itemId: "item-1" }));
    await Promise.all([pulling, secondPulling]);

    expect(takesWhileHeld).toBe(1);
    expect(second.uploads).toEqual([]);
    expect(extension.acknowledged).toEqual([{ type: "picks-saved", mfcItemIds: [1] }]);
  });

  test("a tab hidden while taking picks leaves them, so the tab now showing saves them", async () => {
    const locks = fakeLocks();
    const extension = fakeExtension({
      picks: [fakePick(1)],
      onTake: () => {
        if (extension.takes() > 1) return;
        first.shown.visible = false;
        pullingSecond = second.intake.pull();
      },
    });
    const first = tab({ extension, locks });
    const second = tab({ extension, locks });
    let pullingSecond: Promise<void> = Promise.resolve();

    await first.intake.pull();
    await pullingSecond;

    expect(first.uploads).toEqual([]);
    expect(first.intake.rows()).toEqual([]);
    expect(second.uploads).toEqual([1]);
    expect(second.draft).toEqual(["item-1"]);
    expect(extension.acknowledged).toEqual([{ type: "picks-saved", mfcItemIds: [1] }]);
  });

  test("a hidden tab keeps the picks in the extension and saves them when it shows again", async () => {
    const extension = fakeExtension({
      picks: [fakePick(1)],
      onTake: () => {
        if (extension.takes() === 1) shown.visible = false;
      },
    });
    const { intake, shown, uploads } = tab({ extension, locks: undefined });

    await intake.pull();
    const whileHidden = { uploads: [...uploads], kept: extension.picks().length };
    shown.visible = true;
    await intake.pull();

    expect(whileHidden).toEqual({ uploads: [], kept: 1 });
    expect(uploads).toEqual([1]);
    expect(extension.picks()).toEqual([]);
  });

  test("a queued tab that went hidden waits for a later pull", async () => {
    const extension = picked(fakePick(1));
    const locks = fakeLocks();
    const holding = deferred<Saved>();
    const first = tab({
      extension,
      locks,
      save: () => holding.promise,
    });
    const second = tab({ extension, locks });

    const pulling = first.intake.pull();
    await until(() => first.uploads.length === 1);
    const secondPulling = second.intake.pull();
    second.shown.visible = false;
    holding.resolve(Result.err({ kind: "unsaved" }));
    await Promise.all([pulling, secondPulling]);

    expect(extension.takes()).toBe(1);
    expect(second.uploads).toEqual([]);
  });

  test("starts no second pull in a tab while one runs", async () => {
    const extension = picked(fakePick(1));
    const holding = deferred<Saved>();
    const { intake } = tab({ extension, locks: undefined, save: () => holding.promise });

    const pulling = intake.pull();
    await intake.pull();
    holding.resolve(Result.ok({ itemId: "item-1" }));
    await pulling;

    expect(extension.takes()).toBe(1);
  });

  test("reports a pick saved only after the server answered its save", async () => {
    const extension = picked(fakePick(1, "Rem 1/7"));
    const holding = deferred<Saved>();
    const { intake, draft } = tab({ extension, save: () => holding.promise });

    const pulling = intake.pull();
    await until(() => intake.rows().length === 1);
    const whileSaving = { rows: intake.rows(), acknowledged: [...extension.acknowledged] };
    holding.resolve(Result.ok({ itemId: "item-1" }));
    await pulling;

    expect(whileSaving).toEqual({
      rows: [{ mfcItemId: id(1), title: "Rem 1/7", state: "saving" }],
      acknowledged: [],
    });
    expect(draft).toEqual(["item-1"]);
    expect(extension.acknowledged).toEqual([{ type: "picks-saved", mfcItemIds: [1] }]);
  });

  test("keeps a pick whose save failed, shows why and reports only the saved ones", async () => {
    const extension = picked(fakePick(1), fakePick(2));
    const { intake, draft } = tab({
      extension,
      save: async (pick) =>
        pick.mfcItemId === 1 ? Result.err({ kind: "busy" } as const) : savedAs(pick),
    });

    await intake.pull();

    expect(intake.rows()).toEqual([
      { mfcItemId: id(1), title: "Item 1", state: "failed", reason: { kind: "busy" } },
    ]);
    expect(draft).toEqual(["item-2"]);
    expect(extension.acknowledged).toEqual([{ type: "picks-saved", mfcItemIds: [2] }]);
    expect(extension.picks().map((pick) => pick.mfcItemId)).toEqual([1]);
  });

  test("leaves a failed pick for the user's Retry instead of uploading it on every pull", async () => {
    const extension = picked(fakePick(1));
    const { intake, uploads } = tab({
      extension,
      save: async () => Result.err({ kind: "unsaved" } as const),
    });

    await intake.pull();
    await intake.pull();

    expect(extension.takes()).toBe(2);
    expect(uploads).toEqual([1]);
  });

  test("uploads nothing for an unverified email and keeps the picks", async () => {
    const extension = picked(fakePick(1), fakePick(2));
    const { intake, shown, uploads } = tab({ extension });
    shown.verified = false;

    await intake.pull();

    expect(uploads).toEqual([]);
    expect(intake.rows().map((row) => row.state === "failed" && row.reason)).toEqual([
      { kind: "unverified" },
      { kind: "unverified" },
    ]);
    expect(extension.acknowledged).toEqual([]);
    expect(extension.picks()).toHaveLength(2);
  });

  test("saves the picks that waited for a verified email on the next pull", async () => {
    const extension = picked(fakePick(1));
    const { intake, shown, draft } = tab({ extension });
    shown.verified = false;
    await intake.pull();

    shown.verified = true;
    await intake.pull();

    expect(draft).toEqual(["item-1"]);
    expect(intake.rows()).toEqual([]);
    expect(extension.acknowledged).toEqual([{ type: "picks-saved", mfcItemIds: [1] }]);
  });

  test("reads a silent extension as no picks", async () => {
    const extension = fakeExtension({ picks: [fakePick(1)], answersPicks: false });
    const { intake, uploads } = tab({ extension });

    await intake.pull();

    expect(extension.takes()).toBe(1);
    expect(uploads).toEqual([]);
    expect(intake.rows()).toEqual([]);
  });

  test("tells subscribers when the extension stops answering and when it answers again", async () => {
    const extension = picked();
    const { intake } = tab({ extension });
    const seen: boolean[] = [];
    intake.subscribe(() => seen.push(intake.stopped()));

    await intake.pull();
    expect(intake.stopped()).toBe(false);
    extension.stopTakes(true);
    await intake.pull();
    await intake.pull();
    expect(intake.stopped()).toBe(true);
    extension.stopTakes(false);
    await intake.pull();

    expect(intake.stopped()).toBe(false);
    expect(seen).toEqual([true, false]);
  });

  test("tells subscribers each time the rows change", async () => {
    const extension = picked(fakePick(1));
    const { intake } = tab({ extension });
    const seen: number[] = [];
    const stop = intake.subscribe(() => seen.push(intake.rows().length));

    await intake.pull();
    stop();

    expect(seen).toEqual([1, 0]);
  });
});

describe("a failed pick", () => {
  test("Retry uploads the page from the latest pull after the user picks it again", async () => {
    const original = fakePick(1, "Rem 1/7");
    const extension = picked({ ...original, html: "old HTML" });
    const pages: string[] = [];
    let failing = true;
    const { intake } = tab({
      extension,
      save: async (pick) => {
        pages.push(await pick.page.text());
        return failing
          ? Result.err({ kind: "rejected", message: "Wrong page" } as const)
          : savedAs(pick);
      },
    });
    await intake.pull();

    extension.setPicks([repick(original, "corrected HTML", "Rem 1/7 (2nd run)")]);
    await intake.pull();
    const beforeRetry = intake.rows();
    failing = false;
    await intake.retry(id(1));

    expect(pages).toEqual(["old HTML", "corrected HTML"]);
    expect(beforeRetry).toEqual([
      {
        mfcItemId: id(1),
        title: "Rem 1/7 (2nd run)",
        state: "failed",
        reason: { kind: "rejected", message: "Wrong page" },
      },
    ]);
  });

  test("a Retry that fails while a new capture arrives keeps the new capture", async () => {
    const original = fakePick(1);
    const extension = picked({ ...original, html: "old HTML" });
    const pages: string[] = [];
    const answers = [deferred<Saved>(), deferred<Saved>()];
    const { intake } = tab({
      extension,
      save: async (pick) => {
        const answer = answers[pages.length];
        pages.push(await pick.page.text());
        return answer ? answer.promise : savedAs(pick);
      },
    });
    const pulling = intake.pull();
    await until(() => pages.length === 1);
    answers[0]?.resolve(Result.err({ kind: "unsaved" }));
    await pulling;

    const retrying = intake.retry(id(1));
    await until(() => pages.length === 2);
    extension.setPicks([repick(original, "corrected HTML")]);
    await intake.pull();
    answers[1]?.resolve(Result.err({ kind: "unsaved" }));
    await retrying;
    await intake.retry(id(1));

    expect(pages).toEqual(["old HTML", "old HTML", "corrected HTML"]);
  });

  test("a later pull changes nothing for a subscriber when the failed pick looks the same", async () => {
    const extension = picked(fakePick(1));
    const { intake } = tab({
      extension,
      save: async () => Result.err({ kind: "unsaved" } as const),
    });
    await intake.pull();
    const before = intake.rows();

    await intake.pull();

    expect(intake.rows()).toBe(before);
  });

  test("Retry saves it and then reports it saved", async () => {
    const extension = picked(fakePick(1));
    let failing = true;
    const { intake, draft } = tab({
      extension,
      save: async (pick) => (failing ? Result.err({ kind: "unsaved" } as const) : savedAs(pick)),
    });
    await intake.pull();

    failing = false;
    const retried = await intake.retry(id(1));

    expect(retried.isOk()).toBe(true);
    expect(draft).toEqual(["item-1"]);
    expect(intake.rows()).toEqual([]);
    expect(extension.acknowledged).toEqual([{ type: "picks-saved", mfcItemIds: [1] }]);
  });

  test("Retry that fails again keeps it and answers why", async () => {
    const extension = picked(fakePick(1));
    const { intake } = tab({
      extension,
      save: async () =>
        Result.err({ kind: "rejected", message: "The page is for a different item" } as const),
    });
    await intake.pull();

    const retried = await intake.retry(id(1));

    expect(retried.isErr() && retried.error).toEqual({
      kind: "rejected",
      message: "The page is for a different item",
    });
    expect(intake.rows()).toHaveLength(1);
    expect(extension.acknowledged).toEqual([]);
  });

  test("Discard tells the extension to drop it and removes its row", async () => {
    const extension = picked(fakePick(1), fakePick(2));
    const { intake } = tab({
      extension,
      save: async () => Result.err({ kind: "unsaved" } as const),
    });
    await intake.pull();

    const discarded = await intake.discard(id(1));

    expect(discarded.isOk()).toBe(true);
    expect(extension.acknowledged).toEqual([{ type: "picks-discarded", mfcItemIds: [1] }]);
    expect(intake.rows().map((row) => row.mfcItemId)).toEqual([id(2)]);
    expect(extension.picks().map((pick) => pick.mfcItemId)).toEqual([2]);
  });

  test("Discard that the extension never answers keeps the row and says the extension stopped", async () => {
    const extension = picked(fakePick(1));
    const { intake } = tab({
      extension,
      save: async () => Result.err({ kind: "unsaved" } as const),
    });
    await intake.pull();
    extension.setInstalled(false);

    const discarded = await intake.discard(id(1));

    expect(discarded.isErr() && discarded.error).toEqual({ kind: "stopped" });
    expect(intake.rows()).toHaveLength(1);
  });
});
