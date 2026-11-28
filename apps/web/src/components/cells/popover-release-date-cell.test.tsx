import { afterEach, beforeEach, expect, test } from "bun:test";
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
  cleanup();
});

function EditOrderCell({
  initial,
  saved,
}: {
  readonly initial: ReleaseDate | null;
  readonly saved: (ReleaseDate | null)[];
}) {
  const [value, setValue] = useState(initial);
  return (
    <PopoverReleaseDateCell
      value={value}
      orderId="order-1"
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

function renderCell(initial: ReleaseDate | null) {
  const saved: (ReleaseDate | null)[] = [];
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <EditOrderCell initial={initial} saved={saved} />
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

  expect(screen.getByRole("button", { name: "Release" }).textContent).toContain("Jun 2026");
});
