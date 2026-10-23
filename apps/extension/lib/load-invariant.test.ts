import { expect, test } from "bun:test";
import type { PortPicture, RunEvent } from "@myakiba/mfc/bridge";
import {
  CHALLENGE_PAGE,
  COMMIT_STYLES,
  ORIGINS,
  fakeClock,
  fakeExtension,
  itemPage,
  notFoundPage,
  page,
  tooClose,
} from "../test/fake-browser";
import type { CommitStyle, FakeClock } from "../test/fake-browser";
import { PAGE_TIMEOUT_MS } from "./collect";
import type { CollectedPage, PageRequest } from "./collect";
import { PICTURE_TIMEOUT_MS } from "./picture";
import { THROTTLE } from "./throttle";

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const STEPS = 200;
const INJECTION_DELAY_MS = 1000;
const COLLECTOR_TIMEOUT_MS = PAGE_TIMEOUT_MS + INJECTION_DELAY_MS;
const PICTURE_COLLECTOR_TIMEOUT_MS = PICTURE_TIMEOUT_MS + INJECTION_DELAY_MS;

const MODULUS = 2_147_483_647;

/** Park and Miller's minimal standard generator, so a failing mix replays exactly from its seed. */
function seeded(seed: number): () => number {
  let state = seed % MODULUS;
  return () => {
    state = (state * 48_271) % MODULUS;
    return (state - 1) / (MODULUS - 1);
  };
}

async function advance(clock: FakeClock, ms: number): Promise<void> {
  const until = clock.now() + ms;
  const waited = clock.sleep(ms);
  await clock.runUntil(() => clock.now() >= until);
  await waited;
}

function awaitedItem(events: readonly RunEvent<PortPicture>[]): number | null {
  let awaited: number | null = null;
  for (const event of events) {
    if (event.type === "status" && event.state === "needs_user") awaited = event.mfcItemId;
    if (event.type === "done" || (event.type === "item" && event.mfcItemId === awaited)) {
      awaited = null;
    }
  }
  return awaited;
}

/** Drives one seeded mix of runs, cancels, solves, claims and worker restarts against a fake MFC. */
async function play(seed: number, style: CommitStyle | undefined) {
  const random = seeded(seed);
  const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const clock = fakeClock();
  const solved = new Set<number>();
  const seen = {
    limits: 0,
    halts: 0,
    challenges: 0,
    injectionErrors: 0,
    timeouts: 0,
    stalledNavigations: 0,
    stalledNavigationsWithMoreQueued: 0,
    pictureReads: 0,
    stalledPictureReads: 0,
    gatedReads: 0,
    stalledGatedReads: 0,
  };
  const pictureOf = (id: number) => {
    if (id % 3 === 0) return "public";
    return id % 3 === 1 ? "gated" : null;
  };
  const item = (id: number) => page(itemPage(id, pictureOf(id)));

  async function mfc(request: PageRequest): Promise<CollectedPage> {
    const id = request.mfcItemId;
    if (request.mode === "document") {
      return solved.has(id) ? item(id) : page(CHALLENGE_PAGE, { status: 403 });
    }
    const latency = random() < 0.03 ? PAGE_TIMEOUT_MS + 10_000 : between(0, 6000);
    await clock.sleep(Math.min(latency, COLLECTOR_TIMEOUT_MS));
    if (latency > PAGE_TIMEOUT_MS) {
      seen.timeouts += 1;
      throw new DOMException("The operation timed out.", "TimeoutError");
    }
    if (id % 5 === 0 && !solved.has(id)) {
      seen.challenges += 1;
      return page(CHALLENGE_PAGE, { status: 403, cfMitigated: "challenge" });
    }
    const roll = random();
    if (roll < 0.12) {
      seen.limits += 1;
      return page("<html><title>Too many</title></html>", {
        status: 429,
        retryAfter: String(between(1, 20)),
      });
    }
    if (roll < 0.15) {
      seen.halts += 1;
      return page("<html><title>Too many</title></html>", { status: 429, retryAfter: "400" });
    }
    if (roll < 0.18) {
      seen.injectionErrors += 1;
      throw new Error("Frame with ID 0 was removed.");
    }
    if (roll < 0.24) return page(notFoundPage(true), { status: 404 });
    return item(id);
  }

  async function readPicture(signal: AbortSignal, onStall: () => void) {
    const latency = random() < 0.1 ? PICTURE_TIMEOUT_MS + 10_000 : between(0, 8000);
    if (latency > PICTURE_TIMEOUT_MS) onStall();
    await clock.sleep(Math.min(latency, PICTURE_COLLECTOR_TIMEOUT_MS), signal);
    return { base64: "AQID", contentType: "image/jpeg" };
  }

  function publicPicture(_url: URL, signal: AbortSignal) {
    seen.pictureReads += 1;
    return readPicture(signal, () => {
      seen.stalledPictureReads += 1;
    });
  }

  function gatedPicture(_url: string, signal: AbortSignal) {
    seen.gatedReads += 1;
    return readPicture(signal, () => {
      seen.stalledGatedReads += 1;
    });
  }

  function navigationMs(): number {
    if (random() >= 0.1) return between(0, 3000);
    seen.stalledNavigations += 1;
    if (itemsWaiting() > 1) seen.stalledNavigationsWithMoreQueued += 1;
    return PAGE_TIMEOUT_MS + 25_000;
  }

  const created = new Set<number>();
  const claimed = new Set<number>();
  const claims = { pictureTabs: 0, mfcTabs: 0, duringCreate: 0 };
  function claim(tabId: number): void {
    claimed.add(tabId);
    const url = extension.tabs.get(tabId)?.url ?? "";
    if (url.startsWith(ORIGINS.mfcStatic)) claims.pictureTabs += 1;
    else claims.mfcTabs += 1;
    extension.tabs.activate(tabId);
  }

  const extension = fakeExtension({
    clock,
    pages: mfc,
    navigationMs,
    publicPicture,
    gatedPicture,
    deferNavigationCommit: style,
    onTabCreated: (tabId) => {
      created.add(tabId);
      if (random() >= 0.05) return;
      claims.duringCreate += 1;
      claim(tabId);
    },
  });
  let usersTab: number | null = extension.tabs.open(`${ORIGINS.mfc}/`);
  let runs: (ReturnType<typeof extension.run> & { readonly size: number })[] = [];
  const itemsWaiting = () =>
    runs.reduce((count, run) => count + (run.done() ? 0 : run.size - run.items().length), 0);
  const done = {
    cancels: 0,
    cancelsMidLoad: 0,
    restarts: 0,
    restartsMidLoad: 0,
    solves: 0,
    usersTabCloses: 0,
  };
  const loading = () =>
    extension.loads().some((load) => load.endedAt === null || load.endedAt > clock.now());

  for (let step = 0; step < STEPS; step++) {
    const roll = random();
    const open = runs.filter((run) => !run.done());
    if (roll < 0.4) {
      const ids = new Set(Array.from({ length: between(1, 4) }, () => between(1, 25)));
      runs.push({ ...extension.run([...ids]), size: ids.size });
    } else if (roll < 0.5) {
      const run = open[between(0, open.length - 1)];
      if (run) {
        done.cancels += 1;
        if (loading()) done.cancelsMidLoad += 1;
        extension.fetcher.cancel(run.key);
      }
    } else if (roll < 0.54) {
      done.restarts += 1;
      if (loading()) done.restartsMidLoad += 1;
      extension.restart();
      runs = [];
    } else if (roll < 0.78) {
      const awaited = open.map((run) => awaitedItem(run.events)).find((id) => id !== null);
      const tabId = awaited ? extension.tabs.find(`${ORIGINS.mfc}/item/${awaited}`) : undefined;
      if (awaited && tabId !== undefined) {
        done.solves += 1;
        solved.add(awaited);
        extension.tabs.navigate(tabId, { title: `Item ${awaited}`, loadMs: between(0, 3000) });
      }
    } else if (roll < 0.86) {
      const unclaimed = [...created].filter((id) => !claimed.has(id) && extension.tabs.has(id));
      const tabId = unclaimed[between(0, unclaimed.length - 1)];
      if (tabId !== undefined) {
        claim(tabId);
        if (random() < 0.5) {
          extension.tabs.navigate(tabId, {
            url: "https://example.com/",
            title: "Mine",
            loadMs: between(0, 3000),
          });
        }
      }
    } else if (roll < 0.95) {
      if (usersTab === null) {
        usersTab = extension.tabs.open(`${ORIGINS.mfc}/`);
      } else {
        done.usersTabCloses += 1;
        await extension.tabs.api.remove(usersTab);
        usersTab = null;
      }
    }
    await advance(clock, between(0, 15_000));
  }
  await extension.settle();

  const loads = extension.loads();
  const shown = extension.tabs.raised.filter((id) => id !== extension.myakiba.tabId);
  const users = new Set([...claimed, ...shown, ...(usersTab === null ? [] : [usersTab])]);
  return {
    unfinished: loads.filter((load) => load.endedAt === null),
    tooSoon: tooClose(loads, THROTTLE.minGapMs),
    leftOpen: [...created].filter((id) => !users.has(id) && extension.tabs.has(id)),
    closedOnUser: [...users].filter((id) => !extension.tabs.has(id)),
    coverage: {
      ...seen,
      ...done,
      ...claims,
      shown: shown.length,
      loads: loads.length,
      gatedLoads: loads.filter((load) => load.url.includes("_tb=commit")).length,
    },
  };
}

test.each(COMMIT_STYLES)(
  "one MFC load at a time, each 2.5 s after the last ended, and only unclaimed tabs of the extension's closed, across cancels, challenges, rate limits, stalled navigations, picture reads, claims and restarts (%s commits)",
  async (_name, style) => {
    const total = new Map<string, number>();
    for (const seed of SEEDS) {
      const { coverage, ...outcome } = await play(seed, style);
      expect({ seed, ...outcome }).toEqual({
        seed,
        unfinished: [],
        tooSoon: [],
        leftOpen: [],
        closedOnUser: [],
      });
      for (const [name, count] of Object.entries(coverage)) {
        total.set(name, (total.get(name) ?? 0) + count);
      }
    }

    expect([...total].filter(([, count]) => count === 0)).toEqual([]);
  },
);
