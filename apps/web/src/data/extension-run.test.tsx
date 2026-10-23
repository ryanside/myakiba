import { afterEach, describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import * as z from "zod";
import { parseJson } from "@myakiba/utils/parse-json";
import { delegatingBridge, fakeExtension } from "../../test/fake-extension";
import type { FakeRun } from "../../test/fake-extension";

setDefaultTimeout(30_000);

const realAuthClient = await import("@/lib/auth-client");
await mock.module("@/lib/auth-client", () => ({
  ...realAuthClient,
  recheckSession: async () => {},
}));

let extension = fakeExtension();
const { createExtensionBridge } = await import("@/lib/extension-bridge");
let bridge = createExtensionBridge(extension.window);
await mock.module("@/lib/extension-bridge", () => ({
  createExtensionBridge,
  extensionBridge: delegatingBridge(() => bridge),
}));

const { createExtensionRunner, importRun, refreshItemWithExtension, syncRun } =
  await import("./extension-run");
const { ExtensionPromptNotice } = await import("@/components/extension/extension-prompt-notice");

const runFields = z.object({
  jobId: z.string().optional(),
  mfcItemId: z.coerce.number().optional(),
  failures: z.array(z.object({ mfcItemId: z.number(), error: z.string() })).optional(),
});

type Sent = {
  readonly path: string;
  readonly keepalive: boolean;
  readonly fields: z.output<typeof runFields>;
  readonly formKeys: readonly string[];
  readonly page: File | null;
};

const realFetch = globalThis.fetch;
let sent: Sent[] = [];
let answer: (request: Sent) => Promise<Response> | Response = () => Response.json({});

async function readSent(input: RequestInfo | URL, init?: RequestInit): Promise<Sent> {
  const request = new Request(input, init);
  const base = { path: new URL(request.url).pathname, keepalive: init?.keepalive ?? false };
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) {
    const fields = parseJson(runFields, await request.text()).data ?? {};
    return { ...base, fields, formKeys: [], page: null };
  }
  const form = await request.formData();
  const page = form.get("page");
  return {
    ...base,
    fields: runFields.parse(Object.fromEntries(form)),
    formKeys: [...form.keys()],
    page: page instanceof File ? page : null,
  };
}

function fakeFetch() {
  const respond = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = await readSent(input, init);
    sent.push(request);
    return answer(request);
  };
  globalThis.fetch = Object.assign(respond, { preconnect: realFetch.preconnect });
}

const posted = (path: string) => sent.filter((request) => request.path === path);
const tooBusy = () =>
  new Response("Rate limit exceeded", { status: 429, headers: { "retry-after": "3600" } });
const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
const brokenOff = () =>
  new Response(
    new ReadableStream({
      start: (controller) => controller.error(new TypeError("network error")),
    }),
    { headers: { "content-type": "application/json" } },
  );
const imported = () => Response.json({ outcome: "imported", reason: null });
const SESSION = "/api/sync/sessions/ss-1";
const CURRENT = "/api/data-transfer/imports/current";

function loadExtension(onFetch: (run: FakeRun) => void) {
  extension = fakeExtension({ onFetch });
  bridge = createExtensionBridge(extension.window);
}

function fakePage() {
  const listeners = new Set<() => void>();
  return {
    addEventListener: (_type: "pagehide", listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: "pagehide", listener: () => void) => listeners.delete(listener),
    hide: () => {
      for (const listener of listeners) listener();
    },
    listening: () => listeners.size,
  };
}

type RunnerOptions = {
  readonly heartbeatMs?: number;
  readonly failureFlushMs?: number;
  readonly queuedPromptDelayMs?: number;
};

function runner({
  heartbeatMs = 60_000,
  failureFlushMs = 60_000,
  queuedPromptDelayMs = 0,
}: RunnerOptions = {}) {
  const page = fakePage();
  const run = createExtensionRunner({
    bridge,
    page,
    heartbeatMs,
    failureFlushMs,
    queuedPromptDelayMs,
  });
  return { run, page };
}

const sync = (...mfcItemIds: number[]) =>
  syncRun({ sessionId: "ss-1", jobId: "job-1", mfcItemIds });

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
  sent = [];
  answer = () => Response.json({});
});

describe("a sync run", () => {
  test("uploads each fetched page and reports each failure with the extension's code", async () => {
    fakeFetch();
    loadExtension((fetch) => {
      fetch.item(1, "<html>one</html>");
      fetch.fail(2, "mfc_signed_out");
      fetch.done("complete");
    });

    await runner().run(sync(1, 2));

    const [upload] = posted(`${SESSION}/items`);
    expect(upload?.fields).toEqual({ jobId: "job-1", mfcItemId: 1 });
    expect(await upload?.page?.text()).toBe("<html>one</html>");
    expect(posted(`${SESSION}/failures`).map((request) => request.fields)).toEqual([
      { jobId: "job-1", failures: [{ mfcItemId: 2, error: "mfc_signed_out" }] },
    ]);
    expect(posted(`${SESSION}/interrupt`)).toEqual([]);
  });

  test("keeps at most two uploads in flight", async () => {
    let inFlight = 0;
    let most = 0;
    const releases: (() => void)[] = [];
    fakeFetch();
    answer = async () => {
      inFlight += 1;
      most = Math.max(most, inFlight);
      await new Promise<void>((resolve) => {
        releases.push(resolve);
      });
      inFlight -= 1;
      return Response.json({ outcome: "imported", reason: null });
    };
    loadExtension((fetch) => {
      for (const id of fetch.mfcItemIds) fetch.item(id);
      fetch.done("complete");
    });

    const running = runner().run(sync(1, 2, 3, 4, 5));
    while (posted(`${SESSION}/items`).length < 5) {
      await waitFor(() => expect(releases.length).toBeGreaterThan(0));
      releases.shift()?.();
    }
    for (const release of releases) release();
    await running;

    expect(most).toBe(2);
    expect(posted(`${SESSION}/items`).map((request) => request.fields.mfcItemId)).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  test("renews the run while it waits and stops renewing once it ends", async () => {
    fakeFetch();
    loadExtension((fetch) => {
      setTimeout(() => {
        fetch.item(1);
        fetch.done("complete");
      }, 120);
    });

    await runner({ heartbeatMs: 20 }).run(sync(1));
    const renewals = posted(`${SESSION}/heartbeat`).length;
    await new Promise((resolve) => {
      setTimeout(resolve, 60);
    });

    expect(renewals).toBeGreaterThan(0);
    expect(posted(`${SESSION}/heartbeat`)[0]?.fields).toEqual({ jobId: "job-1" });
    expect(posted(`${SESSION}/heartbeat`).length).toBe(renewals);
  });

  test("interrupts the run with a keepalive request when the page goes away", async () => {
    fakeFetch();
    loadExtension(() => {});
    const { run, page } = runner();

    const running = run(sync(1));
    await waitFor(() => expect(extension.runs).toHaveLength(1));
    page.hide();
    await waitFor(() => expect(posted(`${SESSION}/interrupt`)).toHaveLength(1));
    expect(posted(`${SESSION}/interrupt`)[0]).toMatchObject({
      fields: { jobId: "job-1" },
      keepalive: true,
    });

    extension.runs[0]?.done("cancelled");
    await running;
    expect(page.listening()).toBe(0);
  });

  test("stops driving the extension once the page enters the back-forward cache", async () => {
    fakeFetch();
    loadExtension((fetch) => {
      fetch.item(1);
      setTimeout(() => fetch.item(2), 200);
    });
    const { run, page } = runner();

    const running = run(sync(1, 2));
    await waitFor(() => expect(posted(`${SESSION}/items`)).toHaveLength(1));
    page.hide();
    await running;

    expect(posted(`${SESSION}/interrupt`)).toMatchObject([{ keepalive: true }]);
    expect(extension.cancelled).toEqual([extension.runs[0]?.requestId ?? ""]);
    expect(posted(`${SESSION}/items`)).toHaveLength(1);
  });

  test("interrupts the items the extension never fetched when it stops", async () => {
    fakeFetch();
    loadExtension((fetch) => {
      fetch.item(1);
      fetch.done("interrupted");
    });

    await runner().run(sync(1, 2));

    expect(posted(`${SESSION}/items`)).toHaveLength(1);
    expect(posted(`${SESSION}/failures`)).toEqual([]);
    expect(posted(`${SESSION}/interrupt`)).toMatchObject([{ keepalive: false }]);
  });

  test("waits out a short Retry-After and sends the page again", async () => {
    fakeFetch();
    let refusals = 0;
    answer = (request) => {
      if (request.path.endsWith("/items") && refusals === 0) {
        refusals += 1;
        return new Response("Rate limit exceeded", {
          status: 429,
          headers: { "retry-after": "0" },
        });
      }
      return Response.json({ outcome: "imported", reason: null });
    };
    loadExtension((fetch) => {
      fetch.item(1);
      fetch.done("complete");
    });
    const { run } = runner();

    const outcome = await run(sync(1));

    expect(posted(`${SESSION}/items`)).toHaveLength(2);
    expect(posted(`${SESSION}/interrupt`)).toEqual([]);
    expect(outcome).toEqual({ kind: "ended" });
  });

  test("a long Retry-After stops the run and reports the rest as not imported", async () => {
    fakeFetch();
    answer = (request) =>
      request.path.endsWith("/items")
        ? new Response("Rate limit exceeded, try again in 3600 seconds", {
            status: 429,
            headers: { "retry-after": "3600" },
          })
        : Response.json({});
    loadExtension((fetch) => {
      fetch.item(1);
    });
    const { run } = runner();

    const outcome = await run(sync(1, 2, 3));

    expect(extension.cancelled).toEqual([extension.runs[0]?.requestId ?? ""]);
    expect(posted(`${SESSION}/items`)).toHaveLength(1);
    expect(posted(`${SESSION}/interrupt`)).toHaveLength(1);
    expect(outcome).toEqual({ kind: "busy", notImported: 3, retryAfterMs: 3_600_000 });
  });

  test("shows the extension's prompts for the run and clears them as it goes", async () => {
    fakeFetch();
    loadExtension((fetch) => {
      fetch.send({ type: "status", state: "needs_user", mfcItemId: 1, untilMs: null });
    });
    render(<ExtensionPromptNotice sessionId="ss-1" />);

    let running: Promise<unknown> = Promise.resolve();
    await act(async () => {
      running = runner().run(sync(1));
      await waitFor(() => expect(extension.runs).toHaveLength(1));
    });
    expect(
      screen.getByText("Complete the security check in the MyFigureCollection tab"),
    ).toBeDefined();

    await act(async () => {
      extension.runs[0]?.item(1);
      extension.runs[0]?.done("complete");
      await running;
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  test("shows that it waits for the extension only once the wait lasts", async () => {
    fakeFetch();
    loadExtension((fetch) => {
      fetch.status("queued");
    });
    render(<ExtensionPromptNotice sessionId="ss-1" />);

    let running: Promise<unknown> = Promise.resolve();
    await act(async () => {
      running = runner({ queuedPromptDelayMs: 100 }).run(sync(1));
      await waitFor(() => expect(extension.runs).toHaveLength(1));
      await sleep(20);
    });
    expect(screen.queryByText("Waiting for the extension")?.textContent ?? null).toBeNull();
    expect(await screen.findByText("Waiting for the extension")).toBeDefined();

    await act(async () => {
      extension.runs[0]?.status("fetching", 1);
      extension.runs[0]?.item(1);
      extension.runs[0]?.done("complete");
      await running;
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  test("a busy run counts every item it did not import, reported failures included", async () => {
    fakeFetch();
    answer = (request) =>
      request.path === `${SESSION}/items` && request.fields.mfcItemId === 3
        ? tooBusy()
        : Response.json({ outcome: "imported", reason: null });
    loadExtension((fetch) => {
      fetch.fail(1, "mfc_signed_out");
      fetch.item(2);
      fetch.item(3);
    });

    const outcome = await runner().run(sync(1, 2, 3, 4));

    expect(outcome).toEqual({ kind: "busy", notImported: 3, retryAfterMs: 3_600_000 });
  });
});

describe("failure reports", () => {
  test("report the failures that arrive close together in one request", async () => {
    fakeFetch();
    loadExtension((fetch) => {
      fetch.fail(1, "mfc_signed_out");
      fetch.fail(2, "hidden_or_missing");
      setTimeout(() => {
        fetch.fail(3, "timeout");
        fetch.done("complete");
      }, 150);
    });

    await runner({ failureFlushMs: 50 }).run(sync(1, 2, 3));

    expect(posted(`${SESSION}/failures`).map((request) => request.fields)).toEqual([
      {
        jobId: "job-1",
        failures: [
          { mfcItemId: 1, error: "mfc_signed_out" },
          { mfcItemId: 2, error: "hidden_or_missing" },
        ],
      },
      { jobId: "job-1", failures: [{ mfcItemId: 3, error: "timeout" }] },
    ]);
  });

  test("hold at most 1000 failures in one request", async () => {
    fakeFetch();
    loadExtension((fetch) => {
      for (const id of fetch.mfcItemIds) fetch.fail(id, "hidden_or_missing");
      fetch.done("complete");
    });

    await runner().run(sync(...Array.from({ length: 1001 }, (_, index) => index + 1)));

    expect(posted(`${SESSION}/failures`).map((request) => request.fields.failures?.length)).toEqual(
      [1000, 1],
    );
  });

  test("report an unsolved security check for every open item at once", async () => {
    fakeFetch();
    loadExtension((fetch) => {
      fetch.item(1);
      for (const id of fetch.mfcItemIds.slice(1)) fetch.fail(id, "challenge_unsolved");
      fetch.done("complete");
    });

    await runner({ failureFlushMs: 50 }).run(sync(1, 2, 3, 4));

    expect(posted(`${SESSION}/failures`).map((request) => request.fields.failures)).toEqual([
      [
        { mfcItemId: 2, error: "challenge_unsolved" },
        { mfcItemId: 3, error: "challenge_unsolved" },
        { mfcItemId: 4, error: "challenge_unsolved" },
      ],
    ]);
  });

  test("stop the run on a busy answer, like an upload does", async () => {
    fakeFetch();
    answer = (request) =>
      request.path === `${SESSION}/failures`
        ? tooBusy()
        : Response.json({ outcome: "imported", reason: null });
    loadExtension((fetch) => {
      fetch.fail(1, "mfc_signed_out");
      setTimeout(() => fetch.item(2), 200);
    });

    const outcome = await runner({ failureFlushMs: 20 }).run(sync(1, 2));

    expect(extension.cancelled).toEqual([extension.runs[0]?.requestId ?? ""]);
    expect(posted(`${SESSION}/items`)).toEqual([]);
    expect(posted(`${SESSION}/interrupt`)).toMatchObject([{ keepalive: false }]);
    expect(outcome).toEqual({ kind: "busy", notImported: 2, retryAfterMs: 3_600_000 });
  });

  test("still go out after a busy upload, and are answered before the final interrupt", async () => {
    fakeFetch();
    const log: string[] = [];
    answer = async (request) => {
      if (request.path === `${SESSION}/items`) return tooBusy();
      if (request.path === `${SESSION}/failures`) {
        await sleep(50);
        log.push("failures answered");
      }
      if (request.path === `${SESSION}/interrupt`) log.push("interrupt sent");
      return Response.json({});
    };
    loadExtension((fetch) => {
      fetch.fail(1, "mfc_signed_out");
      fetch.item(2);
    });

    const outcome = await runner().run(sync(1, 2, 3));

    expect(posted(`${SESSION}/failures`).map((request) => request.fields.failures)).toEqual([
      [{ mfcItemId: 1, error: "mfc_signed_out" }],
    ]);
    expect(log).toEqual(["failures answered", "interrupt sent"]);
    expect(outcome).toEqual({ kind: "busy", notImported: 3, retryAfterMs: 3_600_000 });
  });
});

describe("the upload cap", () => {
  test("holds for two runs together", async () => {
    let inFlight = 0;
    let most = 0;
    const releases: (() => void)[] = [];
    fakeFetch();
    answer = async (request) => {
      if (!request.path.endsWith("/items")) return Response.json({});
      inFlight += 1;
      most = Math.max(most, inFlight);
      await new Promise<void>((resolve) => {
        releases.push(resolve);
      });
      inFlight -= 1;
      return Response.json({ outcome: "imported", reason: null });
    };
    loadExtension((fetch) => {
      for (const id of fetch.mfcItemIds) fetch.item(id);
      fetch.done("complete");
    });
    const { run } = runner();
    const uploads = () => sent.filter((request) => request.path.endsWith("/items")).length;

    const running = Promise.all([
      run(sync(1, 2, 3)),
      run(importRun({ importId: "imp-1", mfcItemIds: [4, 5, 6] })),
    ]);
    while (uploads() < 6) {
      await waitFor(() => expect(releases.length).toBeGreaterThan(0));
      releases.shift()?.();
    }
    for (const release of releases) release();
    await running;

    expect(most).toBe(2);
  });

  test("lets no page waiting for a slot go out after a busy answer", async () => {
    const releases: (() => void)[] = [];
    fakeFetch();
    answer = async (request) => {
      if (!request.path.endsWith("/items")) return Response.json({});
      await new Promise<void>((resolve) => {
        releases.push(resolve);
      });
      return tooBusy();
    };
    loadExtension((fetch) => {
      for (const id of fetch.mfcItemIds) fetch.item(id);
      fetch.done("complete");
    });

    const running = runner().run(sync(1, 2, 3));
    await waitFor(() => expect(releases).toHaveLength(2));
    releases.shift()?.();
    await sleep(50);
    const releaseRest = setInterval(() => {
      for (const release of releases.splice(0)) release();
    }, 10);
    const outcome = await running;
    clearInterval(releaseRest);

    expect(posted(`${SESSION}/items`).map((request) => request.fields.mfcItemId)).toEqual([1, 2]);
    expect(outcome).toEqual({ kind: "busy", notImported: 3, retryAfterMs: 3_600_000 });
  });
});

test.each([
  ["a sync run", SESSION, sync, { active: false }],
  [
    "an Import/Export run",
    CURRENT,
    (...mfcItemIds: number[]) => importRun({ importId: "imp-1", mfcItemIds }),
    { running: false },
  ],
] as const)("%s stops when the server says it is over", async (_run, path, start, over) => {
  fakeFetch();
  answer = (request) =>
    request.path.endsWith("/heartbeat") ? Response.json(over) : Response.json({});
  loadExtension((fetch) => {
    fetch.item(1);
    setTimeout(() => fetch.item(2), 200);
  });

  await runner({ heartbeatMs: 20 }).run(start(1, 2));

  expect(extension.cancelled).toEqual([extension.runs[0]?.requestId ?? ""]);
  expect(posted(`${path}/items`).map((request) => request.fields.mfcItemId)).toEqual([1]);
  expect(posted(`${path}/interrupt`)).toEqual([]);
});

test("an Import/Export run reports to the import's endpoints", async () => {
  fakeFetch();
  loadExtension((fetch) => {
    fetch.item(1);
    fetch.fail(2, "hidden_or_missing");
    fetch.done("complete");
  });

  await runner().run(importRun({ importId: "imp-1", mfcItemIds: [1, 2] }));

  expect(posted(`${CURRENT}/items`)[0]?.fields).toEqual({ jobId: "imp-1", mfcItemId: 1 });
  expect(posted(`${CURRENT}/items/failure`).map((request) => request.fields)).toEqual([
    { jobId: "imp-1", failures: [{ mfcItemId: 2, error: "hidden_or_missing" }] },
  ]);
});

describe("an answer that breaks off after its headers", () => {
  test("counts its upload as failed and frees the upload slot for later runs", async () => {
    fakeFetch();
    let breakOff = true;
    answer = (request) => (request.path.endsWith("/items") && breakOff ? brokenOff() : imported());
    loadExtension((fetch) => {
      for (const id of fetch.mfcItemIds) fetch.item(id);
      fetch.done("complete");
    });
    const { run } = runner();

    const outcome = await run(sync(1, 2));
    breakOff = false;
    await run(importRun({ importId: "imp-1", mfcItemIds: [3] }));

    expect(outcome).toEqual({ kind: "ended" });
    expect(posted(`${SESSION}/interrupt`)).toMatchObject([{ keepalive: false }]);
    expect(posted(`${CURRENT}/items`).map((request) => request.fields.mfcItemId)).toEqual([3]);
  });

  test("counts a failure report as failed and still ends the run with an interrupt", async () => {
    fakeFetch();
    answer = (request) => (request.path.endsWith("/failures") ? brokenOff() : imported());
    loadExtension((fetch) => {
      fetch.fail(1, "mfc_signed_out");
      fetch.done("complete");
    });

    const outcome = await runner().run(sync(1));

    expect(outcome).toEqual({ kind: "ended" });
    expect(posted(`${SESSION}/interrupt`)).toMatchObject([{ keepalive: false }]);
  });

  test("keeps the run going on a heartbeat", async () => {
    fakeFetch();
    answer = (request) => (request.path.endsWith("/heartbeat") ? brokenOff() : imported());
    loadExtension((fetch) => {
      fetch.item(1);
      setTimeout(() => {
        fetch.item(2);
        fetch.done("complete");
      }, 120);
    });

    const outcome = await runner({ heartbeatMs: 20 }).run(sync(1, 2));

    expect(posted(`${SESSION}/heartbeat`).length).toBeGreaterThan(0);
    expect(posted(`${SESSION}/items`).map((request) => request.fields.mfcItemId)).toEqual([1, 2]);
    expect(outcome).toEqual({ kind: "ended" });
  });
});

describe("a run the user lost access to", () => {
  test.each([401, 403, 404])("stops fetching once a heartbeat answers %d", async (status) => {
    fakeFetch();
    answer = (request) =>
      request.path.endsWith("/heartbeat") ? new Response("Unauthorized", { status }) : imported();
    loadExtension((fetch) => {
      fetch.item(1);
      setTimeout(() => fetch.item(2), 200);
    });

    const outcome = await runner({ heartbeatMs: 20 }).run(sync(1, 2));

    expect(extension.cancelled).toEqual([extension.runs[0]?.requestId ?? ""]);
    expect(posted(`${SESSION}/items`).map((request) => request.fields.mfcItemId)).toEqual([1]);
    expect(posted(`${SESSION}/interrupt`)).toEqual([]);
    expect(outcome).toEqual({ kind: "ended" });
  });

  test.each([
    ["an upload", "/items", (fetch: FakeRun) => fetch.item(1), [1]],
    ["a failure report", "/failures", (fetch: FakeRun) => fetch.fail(1, "timeout"), []],
  ] as const)("stops fetching once %s answers 401", async (_request, path, first, uploaded) => {
    fakeFetch();
    answer = (request) =>
      request.path.endsWith(path) ? new Response("Unauthorized", { status: 401 }) : imported();
    loadExtension((fetch) => {
      first(fetch);
      setTimeout(() => fetch.item(2), 200);
    });

    await runner({ failureFlushMs: 20 }).run(sync(1, 2));

    expect(extension.cancelled).toEqual([extension.runs[0]?.requestId ?? ""]);
    expect(posted(`${SESSION}/items`).map((request) => request.fields.mfcItemId)).toEqual([
      ...uploaded,
    ]);
    expect(posted(`${SESSION}/interrupt`)).toEqual([]);
  });
});

describe("refreshing an item", () => {
  test("posts the fetched page to the item's resync", async () => {
    fakeFetch();
    answer = () =>
      Response.json({
        status: "cooldown",
        cooldownExpiresAt: "2026-10-25T00:00:00.000Z",
        saved: "refreshed",
      });
    loadExtension((fetch) => {
      fetch.item(98_777, "<html>fresh</html>");
      fetch.done("complete");
    });

    const refreshed = await refreshItemWithExtension(98_777);

    expect(refreshed).toEqual({
      status: "cooldown",
      cooldownExpiresAt: "2026-10-25T00:00:00.000Z",
      saved: "refreshed",
    });
    const [resync] = posted("/api/item/98777/resync");
    expect(resync?.formKeys).toEqual(["page"]);
    expect(await resync?.page?.text()).toBe("<html>fresh</html>");
  });

  test("reads a refresh in cooldown as the server's message", async () => {
    fakeFetch();
    answer = () =>
      new Response("Item details were recently refreshed", {
        status: 429,
        headers: { "content-type": "text/plain" },
      });
    loadExtension((fetch) => {
      fetch.item(98_777);
      fetch.done("complete");
    });

    await expect(refreshItemWithExtension(98_777)).rejects.toThrow(
      "Item details were recently refreshed",
    );
  });

  test("sends nothing when the extension cannot fetch the page", async () => {
    fakeFetch();
    loadExtension((fetch) => {
      fetch.fail(98_777, "mfc_signed_out");
      fetch.done("complete");
    });

    await expect(refreshItemWithExtension(98_777)).rejects.toThrow(
      "Sign in to MyFigureCollection to import this item",
    );
    expect(sent).toEqual([]);
  });
});
