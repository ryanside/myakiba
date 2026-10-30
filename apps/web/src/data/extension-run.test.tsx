import { afterEach, describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { Result } from "better-result";
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

const { refreshFailureText, refreshItemWithExtension } = await import("./extension-run");
const { ExtensionPromptNotice } = await import("@/components/extension/extension-prompt-notice");

const runFields = z.object({
  mfcItemId: z.coerce.number().optional(),
});

type Sent = {
  readonly path: string;
  readonly fields: z.output<typeof runFields>;
  readonly formKeys: readonly string[];
  readonly page: File | null;
};

const realFetch = globalThis.fetch;
let sent: Sent[] = [];
let answer: (request: Sent) => Promise<Response> | Response = () => Response.json({});

async function readSent(input: RequestInfo | URL, init?: RequestInit): Promise<Sent> {
  const request = new Request(input, init);
  const base = { path: new URL(request.url).pathname };
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) {
    const fields = parseJson(runFields, await request.text()).unwrapOr({});
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
const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function loadExtension(onFetch: (run: FakeRun) => void) {
  extension = fakeExtension({ onFetch });
  bridge = createExtensionBridge(extension.window);
}

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
  sent = [];
  answer = () => Response.json({});
});

describe("refreshing an item", () => {
  /** The text the refresh's failure shows, or null when it saved. */
  async function failureTextOf(externalId: number) {
    const refreshed = await refreshItemWithExtension(externalId);
    return refreshed.isErr() ? refreshFailureText(refreshed.error) : null;
  }

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

    expect(refreshed.isOk() && refreshed.value).toEqual({
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

    expect(await failureTextOf(98_777)).toBe("Item details were recently refreshed");
  });

  test("waits for a free upload slot while other refreshes hold both", async () => {
    const releases: (() => void)[] = [];
    const refreshed = { status: "cooldown", cooldownExpiresAt: null, saved: "refreshed" };
    fakeFetch();
    answer = async () => {
      await new Promise<void>((resolve) => {
        releases.push(resolve);
      });
      return Response.json(refreshed);
    };
    loadExtension((fetch) => {
      for (const id of fetch.mfcItemIds) fetch.item(id);
      fetch.done("complete");
    });

    const others = [refreshItemWithExtension(1), refreshItemWithExtension(2)];
    await waitFor(() => expect(releases).toHaveLength(2));
    const waiting = refreshItemWithExtension(98_777);
    await sleep(100);
    const refreshesWhileFull = posted("/api/item/98777/resync").length;
    releases.shift()?.();
    await waitFor(() => expect(releases).toHaveLength(2));
    for (const release of releases.splice(0)) release();
    await Promise.all([...others, waiting]);

    expect(refreshesWhileFull).toBe(0);
    expect(posted("/api/item/98777/resync")).toHaveLength(1);
  });

  test("shows the extension's prompts for the refresh and clears them as it goes", async () => {
    fakeFetch();
    answer = () =>
      Response.json({ status: "cooldown", cooldownExpiresAt: null, saved: "refreshed" });
    loadExtension((fetch) => {
      fetch.send({ type: "status", state: "needs_user", mfcItemId: 98_777, untilMs: null });
    });
    render(<ExtensionPromptNotice />);

    let running: Promise<Result<unknown, unknown>> = Promise.resolve(Result.ok(null));
    await act(async () => {
      running = refreshItemWithExtension(98_777);
      await waitFor(() => expect(extension.runs).toHaveLength(1));
    });
    expect(
      screen.getByText("Complete the security check in the MyFigureCollection tab"),
    ).toBeDefined();

    await act(async () => {
      extension.runs[0]?.item(98_777);
      extension.runs[0]?.done("complete");
      await running;
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  test("shows that it waits for the extension only once the wait lasts", async () => {
    fakeFetch();
    answer = () =>
      Response.json({ status: "cooldown", cooldownExpiresAt: null, saved: "refreshed" });
    loadExtension((fetch) => {
      fetch.status("queued");
    });
    render(<ExtensionPromptNotice />);

    let running: Promise<Result<unknown, unknown>> = Promise.resolve(Result.ok(null));
    await act(async () => {
      running = refreshItemWithExtension(98_777);
      await waitFor(() => expect(extension.runs).toHaveLength(1));
      await sleep(20);
    });
    expect(screen.queryByText("Waiting for the extension")).toBeNull();
    expect(
      await screen.findByText("Waiting for the extension", {}, { timeout: 3000 }),
    ).toBeDefined();

    await act(async () => {
      extension.runs[0]?.status("fetching", 98_777);
      extension.runs[0]?.item(98_777);
      extension.runs[0]?.done("complete");
      await running;
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  test.each([
    ["mfc_signed_out", "Sign in to MyFigureCollection to refresh this item"],
    [
      "hidden_or_missing",
      "MyFigureCollection hides this item. Check your MyFigureCollection content settings",
    ],
    ["challenge_unsolved", "The MyFigureCollection security check was not completed"],
    ["rate_limited", "MyFigureCollection asked us to slow down. Try again later"],
    ["timeout", "MyFigureCollection took too long to answer"],
    ["unexpected_page", "MyFigureCollection showed an unexpected page"],
    ["solar_flare", "The extension could not fetch this item"],
  ])("says why the extension could not fetch the page when it answers %s", async (code, text) => {
    fakeFetch();
    loadExtension((fetch) => {
      fetch.fail(98_777, code);
      fetch.done("complete");
    });

    expect(await failureTextOf(98_777)).toBe(text);
    expect(sent).toEqual([]);
  });

  test("says the extension stopped when it ends without the page", async () => {
    fakeFetch();
    loadExtension((fetch) => {
      fetch.done("interrupted");
    });

    expect(await failureTextOf(98_777)).toBe(
      "The extension stopped. Reload the page and try again",
    );
    expect(sent).toEqual([]);
  });

  test("says an id that is no MFC item is not found, without asking the extension", async () => {
    fakeFetch();
    loadExtension(() => {});

    expect(await failureTextOf(0)).toBe("Item not found");
    expect(extension.runs).toEqual([]);
    expect(sent).toEqual([]);
  });

  test("sends nothing when the extension cannot fetch the page", async () => {
    fakeFetch();
    loadExtension((fetch) => {
      fetch.fail(98_777, "mfc_signed_out");
      fetch.done("complete");
    });

    expect(await failureTextOf(98_777)).toBe("Sign in to MyFigureCollection to refresh this item");
    expect(sent).toEqual([]);
  });
});
