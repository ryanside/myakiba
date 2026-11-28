import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { CalendarResponse } from "@/queries/calendar";

const realRouter = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  Link: ({ children }: { children: ReactNode }) => <a href="#item">{children}</a>,
}));

const { CalendarReleasePanel } = await import("./calendar-release-list");
const { CalendarMonthGrid } = await import("./calendar-month-grid");

afterEach(cleanup);

const releases: CalendarResponse = {
  view: "items",
  month: 11,
  year: 2026,
  items: [1, 2, 3].map((day) => ({
    releaseId: `release-${day}`,
    itemId: `item-${day}`,
    itemExternalId: null,
    title: `Figure ${day}`,
    image: null,
    category: "Prepainted",
    price: null,
    priceCurrency: null,
    releaseDate: { start: `2026-11-0${day}`, precision: "day" as const },
  })),
};

describe("the calendar's release list", () => {
  test("fades in around its scroll area, so the scrollbar appears with the rows instead of ahead of them", () => {
    render(
      <CalendarReleasePanel
        data={releases}
        isPending={false}
        view="items"
        selectedDays={new Set()}
        currency="USD"
        locale="en-US"
      />,
    );

    const scrollArea = screen.getByText("Figure 1").closest(".overflow-y-auto");
    expect(scrollArea?.closest(".animate-data-in")).not.toBeNull();
    expect(scrollArea?.querySelector(".animate-data-in")).toBeNull();
  });
});

describe("a release known only to its month", () => {
  const monthOnly = {
    releaseId: "release-month",
    itemId: "item-month",
    itemExternalId: null,
    title: "Figure Month",
    image: null,
    category: "Prepainted" as const,
    price: null,
    priceCurrency: null,
    releaseDate: { start: "2026-11-01", precision: "month" as const },
  };
  const withMonthOnly: CalendarResponse = { ...releases, items: [...releases.items, monthOnly] };

  const groups = () =>
    [...document.querySelectorAll("ol > li")].map((group) => ({
      caption: group.querySelector(":scope > div")?.textContent ?? null,
      first: group.querySelector("ul > li")?.textContent?.includes("Figure Month") ?? false,
    }));

  test("leads the month with no caption, apart from the release on the 1st", () => {
    render(
      <CalendarReleasePanel
        data={withMonthOnly}
        isPending={false}
        view="items"
        selectedDays={new Set()}
        currency="USD"
        locale="en-US"
      />,
    );

    expect(groups()).toEqual([
      { caption: null, first: true },
      { caption: "Sun, Nov 1", first: false },
      { caption: "Mon, Nov 2", first: false },
      { caption: "Tue, Nov 3", first: false },
    ]);
  });

  test("falls on no day the user picks", () => {
    render(
      <CalendarReleasePanel
        data={withMonthOnly}
        isPending={false}
        view="items"
        selectedDays={new Set([1])}
        currency="USD"
        locale="en-US"
      />,
    );

    expect(screen.queryByText("Figure Month")).toBeNull();
    expect(screen.getByText("Figure 1").textContent).toBe("Figure 1");
  });

  test("sits in no day cell of the month grid", () => {
    render(
      <CalendarMonthGrid month={11} year={2026} data={withMonthOnly} onToggleDay={() => {}} />,
    );

    expect(screen.getByRole("button", { name: /2026-11-01/u }).getAttribute("aria-label")).toBe(
      "filter 2026-11-01 (1 release)",
    );
  });
});
