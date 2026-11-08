import { afterEach, expect, setSystemTime, test } from "bun:test";
import { act, cleanup, render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { ReleaseItemTile } from "./release-item-tile";

const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
const realTimeZone = process.env.TZ;
type HeldTimer = { readonly due: number; readonly callback: () => void };
let midnightTimers: HeldTimer[] = [];

function holdLongTimers() {
  globalThis.setTimeout = ((callback: () => void, delay = 0, ...args: unknown[]) => {
    if (delay < 60_000) return realSetTimeout(callback, delay, ...args);
    const timer: HeldTimer = { due: Date.now() + delay, callback };
    midnightTimers.push(timer);
    return timer;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((timer: HeldTimer | ReturnType<typeof setTimeout> | undefined) => {
    midnightTimers = midnightTimers.filter((entry) => entry !== timer);
    if (timer && !("due" in timer)) realClearTimeout(timer);
  }) as typeof clearTimeout;
}

function advanceTo(iso: string) {
  act(() => {
    setSystemTime(new Date(iso));
    const due = midnightTimers.filter((timer) => timer.due <= Date.now());
    midnightTimers = midnightTimers.filter((timer) => timer.due > Date.now());
    for (const timer of due) timer.callback();
  });
}

afterEach(() => {
  cleanup();
  globalThis.setTimeout = realSetTimeout;
  globalThis.clearTimeout = realClearTimeout;
  if (realTimeZone === undefined) delete process.env.TZ;
  else process.env.TZ = realTimeZone;
  midnightTimers = [];
  setSystemTime();
});

test("a tile releasing today reads Released after midnight passes with no other update", async () => {
  process.env.TZ = "America/New_York";
  setSystemTime(new Date("2026-10-16T16:00:00Z"));
  holdLongTimers();
  const tile = (
    <ReleaseItemTile
      viewMode="grid"
      item={{
        title: "Hatsune Miku",
        image: null,
        category: "Prepainted",
        latestRelease: { date: "2026-10-16", price: 12_000, priceCurrency: "JPY" },
      }}
      destination={{ to: "/item/$externalId", params: { externalId: 123 } }}
      currency="JPY"
      dateFormat="MM/DD/YYYY"
    />
  );
  const router = createRouter({
    routeTree: createRootRoute({ component: () => tile }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
  expect(screen.getByText("Releases 10/16/2026")).toBeDefined();

  advanceTo("2026-10-17T04:00:01Z");

  expect(screen.getByText("Released 10/16/2026")).toBeDefined();
});
