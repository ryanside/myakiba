import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { EMAIL_VERIFICATION_REQUIRED } from "@myakiba/contracts/shared/messages";
import { delegatingBridge, fakeExtension, fakePick } from "../../../test/fake-extension";
import type { FakePick } from "../../../test/fake-extension";
import type { AddChoices } from "./add";

type Answer =
  | { readonly data: unknown; readonly error: null }
  | {
      readonly data: null;
      readonly error: { readonly status: number; readonly value: unknown };
      readonly response?: Response;
    };

const ok = <Data,>(data: Data): Answer => ({ data, error: null });
const refused = (status: number, value: string): Answer => ({
  data: null,
  error: { status, value },
  response: new Response(String(value), { status }),
});
const unreachable: Answer = { data: null, error: { status: 503, value: new TypeError("offline") } };

const COMMITTED = { committed: [], orderId: null, wishlistAdded: 1, listIds: [] };

const server = {
  itemQueries: [] as unknown[],
  commits: [] as { readonly commitId: string }[],
  commitAnswer: (): Answer => ok(COMMITTED),
  uploads: [] as { readonly mfcItemId: number; readonly page: File; readonly picture?: File }[],
  uploadAnswer: async (mfcItemId: number): Promise<Answer> =>
    ok({ saved: "created", itemId: `item-${mfcItemId}`, mfcItemId }),
};

await mock.module("@/lib/treaty-client", () => ({
  app: {
    api: {
      add: {
        items: {
          get: async ({ query }: { readonly query: unknown }) => {
            server.itemQueries.push(query);
            return ok({ items: [] });
          },
        },
        commit: {
          post: async (body: { readonly commitId: string }) => {
            server.commits.push(body);
            return server.commitAnswer();
          },
        },
      },
      "mfc-items": {
        post: async (body: (typeof server.uploads)[number]) => {
          server.uploads.push(body);
          return server.uploadAnswer(body.mfcItemId);
        },
      },
    },
  },
}));

let extension = fakeExtension();
const { createExtensionBridge } = await import("@/lib/extension-bridge");
let bridge = createExtensionBridge(extension.window, { picksAnswerMs: 50 });
await mock.module("@/lib/extension-bridge", () => ({
  createExtensionBridge,
  extensionBridge: delegatingBridge(() => bridge),
}));

const { toast } = await import("@/components/ui/toast");
const { inFamilies } = await import("../catalog");
const { tabUploadSlots } = await import("../upload-slots");
const { pickFailureCopy } = await import("@/lib/pick-failure");
const { add, useCommitAdd, usePickIntake } = await import("./add");

const toastAdd = spyOn(toast, "add");

const realVisibility = Object.getOwnPropertyDescriptor(document, "visibilityState");
let visibility: DocumentVisibilityState = "visible";

beforeEach(() => {
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
});

afterEach(() => {
  cleanup();
  if (realVisibility) Object.defineProperty(document, "visibilityState", realVisibility);
  else Reflect.deleteProperty(document, "visibilityState");
  server.itemQueries = [];
  server.commits = [];
  server.commitAnswer = () => ok(COMMITTED);
  server.uploads = [];
  server.uploadAnswer = async (mfcItemId) =>
    ok({ saved: "created", itemId: `item-${mfcItemId}`, mfcItemId });
  toastAdd.mockClear();
});

function withClient(queryClient = new QueryClient()) {
  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

describe("add.items", () => {
  test("is keyed in the itemDatabase family and asks for the draft's ids", async () => {
    const { queryClient } = withClient();

    await queryClient.fetchQuery(add.items.options(["item-1", "item-2"]));

    expect(inFamilies(add.items.key(["item-1"]), ["itemDatabase"])).toBe(true);
    expect(add.items.key(["item-1", "item-2"])).toEqual([
      "item-database-items",
      "add",
      ["item-1", "item-2"],
    ]);
    expect(server.itemQueries).toEqual([{ ids: ["item-1", "item-2"] }]);
  });

  test("answers an empty draft without a request", async () => {
    const { queryClient } = withClient();

    expect(await queryClient.fetchQuery(add.items.options([]))).toEqual({ items: [] });
    expect(server.itemQueries).toEqual([]);
  });
});

const CHOICES: AddChoices = {
  rows: [{ itemId: "item-1", price: null }],
  ownership: { kind: "none" },
  wishlist: true,
  listIds: [],
};

const SHARED = {
  shop: "AmiAmi",
  collectionDate: null,
  shippingMethod: "n/a",
  condition: "New",
  count: 1,
} as const;

function renderCommit(queryClient?: QueryClient) {
  const { wrapper } = withClient(queryClient);
  return renderHook(() => useCommitAdd(), { wrapper }).result;
}

describe("an Add commit", () => {
  test("refetches the Collection, Order, Wishlist, List and Item Database reads, and no others", async () => {
    const queryClient = new QueryClient();
    const keys = {
      collection: ["collection", { page: 1 }],
      orders: ["orders", {}],
      wishlist: ["resource", "wishlist", "items", { releaseStatus: "all" }],
      lists: ["lists"],
      itemDatabase: ["item-database-items", "add", ["item-1"]],
      dashboard: ["dashboard"],
      releases: ["itemReleases", "item-1"],
      version: ["version"],
    } as const;
    for (const key of Object.values(keys)) queryClient.setQueryData(key, {});
    const commit = renderCommit(queryClient);

    const committed = await act(() => commit.current.run(CHOICES));

    expect(committed.isOk()).toBe(true);
    expect(
      Object.fromEntries(
        Object.entries(keys).map(([name, key]) => [
          name,
          queryClient.getQueryState(key)?.isInvalidated,
        ]),
      ),
    ).toEqual({
      collection: true,
      orders: true,
      wishlist: true,
      lists: true,
      itemDatabase: true,
      dashboard: true,
      releases: false,
      version: false,
    });
  });

  test("that fails refetches nothing", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["collection"], {});
    server.commitAnswer = () => unreachable;
    const commit = renderCommit(queryClient);

    await act(() => commit.current.run(CHOICES));

    expect(queryClient.getQueryState(["collection"])?.isInvalidated).toBe(false);
  });

  test("sends the same commitId when the same click is retried, and a new one for a new click", async () => {
    const commit = renderCommit();

    server.commitAnswer = () => unreachable;
    await act(() => commit.current.run(CHOICES));
    server.commitAnswer = () => ok(COMMITTED);
    await act(() => commit.current.run(CHOICES));
    await act(() => commit.current.run(CHOICES));

    const [failed, retried, next] = server.commits.map((sent) => sent.commitId);
    expect(failed).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/u);
    expect(retried).toBe(failed);
    expect(next).not.toBe(failed);
  });

  test("keeps the commitId when a retry rebuilds the same choices in another property order", async () => {
    const commit = renderCommit();

    server.commitAnswer = () => unreachable;
    await act(() =>
      commit.current.run({
        rows: [{ itemId: "item-1", price: 1200 }],
        ownership: { kind: "collection", shared: SHARED },
        wishlist: false,
        listIds: ["list-1"],
      }),
    );
    server.commitAnswer = () => ok(COMMITTED);
    await act(() =>
      commit.current.run({
        listIds: ["list-1"],
        wishlist: false,
        ownership: {
          shared: Object.fromEntries(Object.entries(SHARED).toReversed()) as typeof SHARED,
          kind: "collection",
        },
        rows: [{ price: 1200, itemId: "item-1" }],
      }),
    );

    const [failed, retried] = server.commits.map((sent) => sent.commitId);
    expect(retried).toBe(failed);
  });

  test("starts a new commit when a nested choice changes after a failure", async () => {
    const commit = renderCommit();

    server.commitAnswer = () => unreachable;
    await act(() =>
      commit.current.run({ ...CHOICES, ownership: { kind: "collection", shared: SHARED } }),
    );
    await act(() =>
      commit.current.run({
        ...CHOICES,
        ownership: { kind: "collection", shared: { ...SHARED, condition: "Pre-Owned" } },
      }),
    );

    const [first, second] = server.commits.map((sent) => sent.commitId);
    expect(second).not.toBe(first);
  });

  test("starts a new commit when the choices change after a failure", async () => {
    const commit = renderCommit();

    server.commitAnswer = () => refused(404, "Some items are no longer in the item database");
    await act(() => commit.current.run(CHOICES));
    await act(() => commit.current.run({ ...CHOICES, rows: [{ itemId: "item-2", price: null }] }));

    const [first, second] = server.commits.map((sent) => sent.commitId);
    expect(second).not.toBe(first);
  });

  test.each([
    [
      "an Item gone",
      refused(404, "Some items are no longer in the item database"),
      "Some items are no longer in the item database",
    ],
    [
      "a reused commitId",
      refused(409, "These items were already added with different choices"),
      "These items were already added with different choices",
    ],
    ["an Order gone", refused(404, "Order not found"), "Order not found"],
    ["a List gone", refused(404, "List or selection not found"), "List or selection not found"],
    ["an unverified email", refused(403, EMAIL_VERIFICATION_REQUIRED), EMAIL_VERIFICATION_REQUIRED],
    [
      "the hourly limit",
      refused(429, "Rate limit exceeded, try again in 60 seconds"),
      "You've added a lot of items this hour. Try again in a few minutes.",
    ],
    ["a server error", refused(500, "boom"), "myakiba could not add these items. Try again."],
    ["no connection", unreachable, "myakiba could not add these items. Try again."],
  ])("refused for %s says why", async (_cause, answer, description) => {
    server.commitAnswer = () => answer;
    const commit = renderCommit();

    const committed = await act(() => commit.current.run(CHOICES));

    expect(committed.isErr()).toBe(true);
    expect(toastAdd).toHaveBeenCalledWith({
      type: "error",
      title: "Failed to add the items",
      description,
    });
  });
});

function loadExtension(picks: readonly FakePick[]) {
  extension = fakeExtension({ picks });
  bridge = createExtensionBridge(extension.window, { picksAnswerMs: 50 });
}

function renderIntake({
  emailVerified = true,
  queryClient,
}: { readonly emailVerified?: boolean; readonly queryClient?: QueryClient } = {}) {
  const draft: string[] = [];
  const { wrapper } = withClient(queryClient);
  const { result } = renderHook(
    () => usePickIntake({ emailVerified, onSaved: (itemIds) => draft.push(...itemIds) }),
    { wrapper },
  );
  return { result, draft };
}

describe("pick intake", () => {
  test("pulls on load and whenever the tab shows again, never while it is hidden", async () => {
    loadExtension([]);
    renderIntake();
    await waitFor(() => expect(extension.takes()).toBe(1));

    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(extension.takes()).toBe(2));
    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
    await sleep(100);
    const whileHidden = extension.takes();
    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));

    expect(whileHidden).toBe(2);
    await waitFor(() => expect(extension.takes()).toBe(3));
  });

  test("uploads each pick's page and picture, adds its Item and reports it saved", async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    loadExtension([{ ...fakePick(98_777), picture: { bytes, contentType: "image/jpeg" } }]);
    const queryClient = new QueryClient();
    queryClient.setQueryData(["item-database-items", { search: "rem" }], {});

    const { draft } = renderIntake({ queryClient });

    await waitFor(() => expect(extension.acknowledged).toHaveLength(1));
    const [upload] = server.uploads;
    expect(upload?.mfcItemId).toBe(98_777);
    expect(await upload?.page.text()).toBe("<html>98777</html>");
    expect(upload?.picture?.type).toBe("image/jpeg");
    expect(draft).toEqual(["item-98777"]);
    expect(extension.acknowledged).toEqual([{ type: "picks-saved", mfcItemIds: [98_777] }]);
    expect(
      queryClient.getQueryState(["item-database-items", { search: "rem" }])?.isInvalidated,
    ).toBe(true);
  });

  test("uploads nothing for an unverified email and keeps the picks", async () => {
    loadExtension([fakePick(1)]);

    const { result } = renderIntake({ emailVerified: false });

    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.rows[0]).toMatchObject({
      state: "failed",
      reason: { kind: "unverified" },
    });
    expect(server.uploads).toEqual([]);
    expect(extension.picks()).toHaveLength(1);
  });

  test("shares the tab's two upload slots with Item Refresh", async () => {
    loadExtension([fakePick(1), fakePick(2)]);
    const held: (() => void)[] = [];
    server.uploadAnswer = async (mfcItemId) => {
      await new Promise<void>((resolve) => {
        held.push(resolve);
      });
      return ok({ saved: "created", itemId: `item-${mfcItemId}`, mfcItemId });
    };
    await tabUploadSlots.take();
    await tabUploadSlots.take();

    const { result } = renderIntake();
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    await sleep(50);
    const whileRefreshing = server.uploads.length;
    tabUploadSlots.give();
    await waitFor(() => expect(server.uploads).toHaveLength(1));
    await sleep(50);
    const withOneSlot = server.uploads.length;
    tabUploadSlots.give();
    await waitFor(() => expect(server.uploads).toHaveLength(2));
    for (const release of held) release();

    expect([whileRefreshing, withOneSlot]).toEqual([0, 1]);
    await waitFor(() => expect(result.current.rows).toEqual([]));
  });

  test.each([
    [
      "an NSFW page under SFW mode",
      refused(400, "Turn off SFW mode in your MyFigureCollection menu to save this NSFW item"),
      {
        kind: "rejected",
        message: "Turn off SFW mode in your MyFigureCollection menu to save this NSFW item",
      },
    ],
    ["an unverified email", refused(403, EMAIL_VERIFICATION_REQUIRED), { kind: "unverified" }],
    [
      "the hourly limit",
      refused(429, "Rate limit exceeded, try again in 60 seconds"),
      { kind: "busy" },
    ],
    ["a server error", refused(500, "boom"), { kind: "unsaved" }],
    ["no connection", unreachable, { kind: "unsaved" }],
  ])("keeps a pick refused for %s and shows why", async (_cause, answer, reason) => {
    loadExtension([fakePick(1)]);
    server.uploadAnswer = async () => answer;

    const { result } = renderIntake();

    await waitFor(() => expect(result.current.rows[0]?.state).toBe("failed"));
    expect(result.current.rows[0]).toMatchObject({ state: "failed", reason });
    expect(extension.acknowledged).toEqual([]);
    expect(toastAdd).not.toHaveBeenCalled();
  });

  test("says the extension stopped when a take ends without picks, and clears it on the next answer", async () => {
    loadExtension([]);
    const { result } = renderIntake();
    await waitFor(() => expect(extension.takes()).toBe(1));
    expect(result.current.stopped).toBe(false);

    extension.stopTakes(true);
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(result.current.stopped).toBe(true));

    extension.stopTakes(false);
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(result.current.stopped).toBe(false));
  });

  test("Retry and Discard act on a failed pick", async () => {
    loadExtension([fakePick(1), fakePick(2)]);
    server.uploadAnswer = async () => refused(500, "boom");
    const { result, draft } = renderIntake();
    await waitFor(() =>
      expect(result.current.rows.map((row) => row.state)).toEqual(["failed", "failed"]),
    );

    server.uploadAnswer = async (mfcItemId) =>
      ok({ saved: "existing", itemId: `item-${mfcItemId}`, mfcItemId });
    const [first, second] = result.current.rows;
    if (!first || !second) throw new Error("expected two failed picks");
    const retried = await act(() => result.current.retry(first.mfcItemId));
    const discarded = await act(() => result.current.discard(second.mfcItemId));

    expect([retried.isOk(), discarded.isOk()]).toEqual([true, true]);
    expect(draft).toEqual(["item-1"]);
    expect(result.current.rows).toEqual([]);
    expect(extension.acknowledged).toEqual([
      { type: "picks-saved", mfcItemIds: [1] },
      { type: "picks-discarded", mfcItemIds: [2] },
    ]);
  });
});

describe("pick failure copy", () => {
  test("offers MFC's settings only for a page hidden by SFW mode", () => {
    const sfw = pickFailureCopy(
      {
        kind: "rejected",
        message: "Turn off SFW mode in your MyFigureCollection menu to save this NSFW item",
      },
      98_777,
    );
    const wrongItem = pickFailureCopy(
      { kind: "rejected", message: "The page is for a different item" },
      98_777,
    );

    expect(sfw).toEqual({
      text: "Turn off SFW mode in your MyFigureCollection menu to save this NSFW item",
      actions: [
        { kind: "retry" },
        { kind: "open", label: "Open on MFC", href: "https://myfigurecollection.net/item/98777" },
        {
          kind: "open",
          label: "Open MFC settings",
          href: "https://myfigurecollection.net/settings/",
        },
      ],
    });
    expect(wrongItem.actions).toEqual(sfw.actions.slice(0, 2));
  });

  test.each([
    ["unverified", "Verify your email to add these.", [{ kind: "resend-verification" }]],
    [
      "busy",
      "You've added a lot of items this hour. Try again in a few minutes.",
      [{ kind: "retry" }],
    ],
    ["unsaved", "myakiba could not save this item.", [{ kind: "retry" }]],
    ["stopped", "The extension stopped. Reload the page to see your picks.", []],
  ] as const)("words %s", (kind, text, actions) => {
    expect(pickFailureCopy({ kind }, 1)).toEqual({ text, actions });
  });
});
