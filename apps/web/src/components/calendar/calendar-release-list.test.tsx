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
    releaseDate: `2026-11-0${day}`,
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
