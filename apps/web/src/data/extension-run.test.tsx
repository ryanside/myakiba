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
  error: z.string().optional(),
  reason: z.string().optional(),
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
const SESSION = "/api/sync/sessions/ss-1";

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

function runner(options: { readonly heartbeatMs?: number } = {}) {
  const page = fakePage();
  const run = createExtensionRunner({ bridge, page, heartbeatMs: options.heartbeatMs ?? 60_000 });
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
      { jobId: "job-1", mfcItemId: 2, error: "mfc_signed_out" },
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
});

test("an Import/Export run reports to the import's endpoints with a readable reason", async () => {
  fakeFetch();
  loadExtension((fetch) => {
    fetch.item(1);
    fetch.fail(2, "hidden_or_missing");
    fetch.done("complete");
  });

  await runner().run(importRun({ importId: "imp-1", mfcItemIds: [1, 2] }));

  const current = "/api/data-transfer/imports/current";
  expect(posted(`${current}/items`)[0]?.fields).toEqual({ jobId: "imp-1", mfcItemId: 1 });
  expect(posted(`${current}/items/failure`).map((request) => request.fields)).toEqual([
    {
      jobId: "imp-1",
      mfcItemId: 2,
      reason: "MyFigureCollection hides this item. Check your MyFigureCollection content settings",
    },
  ]);
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
