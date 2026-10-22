import { expect, test } from "bun:test";
import type { PortPicture, RunEvent } from "@myakiba/mfc/bridge";
import {
  CHALLENGE_PAGE,
  ORIGINS,
  fakeClock,
  fakeExtension,
  itemPage,
  notFoundPage,
  page,
  tooClose,
} from "../test/fake-browser";
import type { FakeClock } from "../test/fake-browser";
import { PAGE_TIMEOUT_MS } from "./collect";
import type { CollectedPage, PageRequest } from "./collect";
import { THROTTLE } from "./throttle";

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const STEPS = 200;
const INJECTION_MS = 1000;

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

/** Drives one seeded mix of runs, cancels, solves and worker restarts against a fake MFC. */
async function play(seed: number) {
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
  };

  async function mfc(request: PageRequest): Promise<CollectedPage> {
    const id = request.mfcItemId;
    if (request.mode === "document") {
      return solved.has(id) ? page(itemPage(id)) : page(CHALLENGE_PAGE, { status: 403 });
    }
    const latency = random() < 0.03 ? PAGE_TIMEOUT_MS + 10_000 : between(0, 6000);
    // The collector gives up on its own fetch at the page timeout, which starts once it is injected, a little after the throttle's.
    await clock.sleep(Math.min(latency, PAGE_TIMEOUT_MS + INJECTION_MS));
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
    return page(itemPage(id));
  }

  function navigationMs(): number {
    if (random() >= 0.1) return between(0, 3000);
    seen.stalledNavigations += 1;
    if (itemsWaiting() > 1) seen.stalledNavigationsWithMoreQueued += 1;
    return PAGE_TIMEOUT_MS + 25_000;
  }

  const extension = fakeExtension({ clock, pages: mfc, navigationMs });
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
    } else if (roll < 0.85) {
      const awaited = open.map((run) => awaitedItem(run.events)).find((id) => id !== null);
      const tabId = awaited ? extension.tabs.find(`${ORIGINS.mfc}/item/${awaited}`) : undefined;
      if (awaited && tabId !== undefined) {
        done.solves += 1;
        solved.add(awaited);
        extension.tabs.navigate(tabId, { title: `Item ${awaited}`, loadMs: between(0, 3000) });
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
  return {
    unfinished: loads.filter((load) => load.endedAt === null),
    tooSoon: tooClose(loads, THROTTLE.minGapMs),
    coverage: { ...seen, ...done, loads: loads.length },
  };
}

test("one MFC load at a time, each 2.5 s after the last ended, across cancels, challenges, rate limits, stalled navigations and restarts", async () => {
  const total = new Map<string, number>();
  for (const seed of SEEDS) {
    const { unfinished, tooSoon, coverage } = await play(seed);
    expect({ seed, unfinished, tooSoon }).toEqual({ seed, unfinished: [], tooSoon: [] });
    for (const [name, count] of Object.entries(coverage)) {
      total.set(name, (total.get(name) ?? 0) + count);
    }
  }

  expect([...total].filter(([, count]) => count === 0)).toEqual([]);
});
