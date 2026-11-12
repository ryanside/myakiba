import { describe, expect, test } from "bun:test";
import { fakeClock, memoryValue } from "../test/fake-browser";
import { firefoxMatches } from "../test/firefox-match";
import { createMfcTabs } from "./mfc-tab";
import type { Origins } from "./origins";
import type { OwnedTab } from "./owned-tab";
import { resultTabs } from "./tabs";
import type { Tab } from "./tabs";
import { createThrottle, OPEN_THROTTLE } from "./throttle";

const ORIGINS: Origins = {
  web: "http://localhost:3001",
  mfc: "http://127.0.0.1:4601",
  mfcStatic: "http://127.0.0.1:4602",
};
const REQUESTER = { tabId: 1, context: { incognito: false, cookieStoreId: null } };

/** Firefox's tabs, which find a tab only for a pattern Firefox matches, and open none. */
function firefoxTabs(open: readonly Tab[]) {
  const refused = () => Promise.reject(new Error("refused by the browser"));
  return resultTabs(
    {
      get: refused,
      query: async ({ url }) =>
        open.filter((tab) => tab.status === "complete" && firefoxMatches(url, tab.url ?? "")),
      create: refused,
      update: refused,
      remove: refused,
    },
    { update: refused },
  );
}

function leaseIn(open: readonly Tab[]) {
  const clock = fakeClock();
  const mfcTabs = createMfcTabs({
    tabs: firefoxTabs(open),
    clock,
    origins: ORIGINS,
    owned: memoryValue<OwnedTab>(null),
    throttle: createThrottle({ clock, random: () => 0.5, state: memoryValue(OPEN_THROTTLE) }),
  });
  return mfcTabs.lease(() => REQUESTER, new AbortController().signal);
}

const openTab = (id: number, url: string): Tab => ({
  id,
  url,
  status: "complete",
  incognito: false,
});

describe("an MFC origin with a port, in Firefox", () => {
  test("borrows the MFC tab the user has open", async () => {
    const lease = await leaseIn([openTab(7, `${ORIGINS.mfc}/item/2336325`)]);

    expect(lease.isOk() && lease.value).toEqual({ kind: "borrowed", tabId: 7 });
  });

  test("never borrows a tab on the same host with another port", async () => {
    const lease = await leaseIn([openTab(8, `${ORIGINS.mfcStatic}/item/2336325`)]);

    expect(lease.isOk() && lease.value).not.toEqual({ kind: "borrowed", tabId: 8 });
  });
});
