import { afterEach, beforeEach, expect, setSystemTime, test } from "bun:test";
import { Result } from "better-result";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import type { ReleaseDate } from "@myakiba/contracts/shared/release-date";
import { PopoverReleaseDateCell } from "./popover-release-date-cell";

const JUNE: ReleaseDate = { start: "2026-06-01", precision: "month" };
const JUNE_FIRST: ReleaseDate = { start: "2026-06-01", precision: "day" };

const realFetch = globalThis.fetch;

beforeEach(() => {
  const releases = [
    { releaseDate: JUNE, itemImage: null },
    { releaseDate: JUNE_FIRST, itemImage: null },
  ];
  globalThis.fetch = Object.assign(async () => Response.json(releases), {
    preconnect: realFetch.preconnect,
  });
});

afterEach(() => {
  globalThis.fetch = realFetch;
  setSystemTime();
  cleanup();
});

function EditOrderCell({
  initial,
  saved,
  offerMonths,
}: {
  readonly initial: ReleaseDate | null;
  readonly saved: (ReleaseDate | null)[];
  readonly offerMonths: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <PopoverReleaseDateCell
      value={value}
      orderId="order-1"
      offerMonths={offerMonths}
      triggerVariant="outline"
      placeholder="Select release"
      onSubmit={async (next) => {
        saved.push(next);
        setValue(next);
        return Result.ok();
      }}
    />
  );
}

function renderCell(initial: ReleaseDate | null, { offerMonths = false } = {}) {
  const saved: (ReleaseDate | null)[] = [];
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <EditOrderCell initial={initial} saved={saved} offerMonths={offerMonths} />
    </QueryClientProvider>,
  );
  return { saved, trigger: () => screen.getByRole("button") };
}

async function releaseList() {
  const boxes = await screen.findAllByRole("combobox");
  const list = boxes.find((box) => box.getAttribute("aria-haspopup") === "listbox");
  if (!list) throw new Error("the picker has no release list");
  return list;
}

async function pickRelease(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await releaseList());
  await user.click(await screen.findByRole("option", { name }));
}

async function pickDay(user: ReturnType<typeof userEvent.setup>, day: RegExp) {
  const grid = await screen.findByRole("grid");
  await user.click(within(grid).getByRole("button", { name: day }));
}

test("an Order Item's month-only release saves as its month, and a day picked over it saves as that day", async () => {
  const user = userEvent.setup();
  const { saved, trigger } = renderCell(null);

  await user.click(trigger());
  await pickRelease(user, "Jun 2026");
  expect(saved).toEqual([JUNE]);
  expect(trigger().textContent).toContain("Jun 2026");

  await user.click(trigger());
  await pickDay(user, /June 18th, 2026/);
  expect(saved).toEqual([JUNE, { start: "2026-06-18", precision: "day" }]);
  expect(trigger().textContent).toContain("June 18th, 2026");
});

test("a day picked by hand saves as a day, and a month-only release picked over it saves as its month", async () => {
  const user = userEvent.setup();
  const { saved, trigger } = renderCell({ start: "2026-06-18", precision: "day" });

  await user.click(trigger());
  await pickRelease(user, "Jun 2026");
  expect(saved).toEqual([JUNE]);
  expect(trigger().textContent).toContain("Jun 2026");
  expect(trigger().textContent).not.toContain("1st");
});

test("a month-only release and a release on the 1st of that month are two choices, and Clear saves no date", async () => {
  const user = userEvent.setup();
  const { saved, trigger } = renderCell(JUNE);

  await user.click(trigger());
  await user.click(await releaseList());
  const menu = await screen.findByRole("listbox");
  const options = within(menu)
    .getAllByRole("option")
    .map((option) => option.textContent);
  expect(options).toEqual(["Clear", "Jun 2026", "06/01/2026"]);
  await user.click(screen.getByRole("option", { name: "Clear" }));

  expect(saved).toEqual([null]);
  expect(trigger().textContent).toContain("Select release");
});

const markedDays = (grid: HTMLElement) =>
  [...grid.querySelectorAll('[data-selected-single="true"]')].map((day) => day.textContent);

test("a month-only date marks no day on the calendar, and opens on its month", async () => {
  const user = userEvent.setup();
  const { trigger } = renderCell(JUNE);

  await user.click(trigger());
  const grid = await screen.findByRole("grid");
  expect(markedDays(grid)).toEqual([]);
  expect(grid.getAttribute("aria-label") ?? "").toContain("June 2026");
});

test("a day-precise date marks its day on the calendar", async () => {
  const user = userEvent.setup();
  const { trigger } = renderCell(JUNE_FIRST);

  await user.click(trigger());
  expect(markedDays(await screen.findByRole("grid"))).toEqual(["1"]);
});

test("the field takes its label's name, as the date field it replaced in Merge did", () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <label htmlFor="release">Release</label>
      <PopoverReleaseDateCell
        id="release"
        value={JUNE}
        triggerVariant="outline"
        onSubmit={async () => Result.ok()}
      />
    </QueryClientProvider>,
  );

  const field = screen.getByRole("button", { name: "Release" });
  const describedBy = field.getAttribute("aria-describedby") ?? "";
  expect(document.querySelector(`#${describedBy}`)?.textContent).toBe("Jun 2026");
});

async function monthList() {
  const boxes = await screen.findAllByRole("combobox");
  const list = boxes.find((box) => box.textContent?.trim() === "Month");
  if (!list) throw new Error("the picker has no month list");
  return list;
}

test("the Month list offers this month and the next eleven, and saves the month picked as a month", async () => {
  setSystemTime(new Date(2026, 10, 28, 12));
  const user = userEvent.setup();
  const { saved, trigger } = renderCell(JUNE, { offerMonths: true });

  await user.click(trigger());
  await user.click(await monthList());
  const menu = await screen.findByRole("listbox");
  const options = within(menu)
    .getAllByRole("option")
    .map((option) => option.textContent);
  expect(options).toEqual([
    "Nov 2026",
    "Dec 2026",
    "Jan 2027",
    "Feb 2027",
    "Mar 2027",
    "Apr 2027",
    "May 2027",
    "Jun 2027",
    "Jul 2027",
    "Aug 2027",
    "Sep 2027",
    "Oct 2027",
  ]);
  await user.click(screen.getByRole("option", { name: "Dec 2026" }));

  expect(saved).toEqual([{ start: "2026-12-01", precision: "month" }]);
  expect(trigger().textContent).toContain("Dec 2026");
});

test("the Release field offers no month list unless asked", async () => {
  const user = userEvent.setup();
  const { trigger } = renderCell(JUNE);

  await user.click(trigger());
  await releaseList();
  const boxes = screen.getAllByRole("combobox").map((box) => box.textContent ?? "");
  expect(boxes.some((text) => text.trim() === "Month")).toBe(false);
});
