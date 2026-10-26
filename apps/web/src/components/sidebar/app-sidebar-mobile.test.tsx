import { afterEach, beforeEach, expect, test } from "bun:test";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { flushFrame, renderSidebar } from "../../../test/sidebar-app";

const realInnerWidth = Object.getOwnPropertyDescriptor(window, "innerWidth");

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
});

afterEach(() => {
  if (realInnerWidth) Object.defineProperty(window, "innerWidth", realInnerWidth);
});

async function openSheet() {
  await act(async () => {
    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
  });
  return screen.findByRole("dialog");
}

async function expectSheetClosed() {
  await waitFor(() => expect(screen.queryByRole("dialog") === null, "the sheet closes").toBe(true));
}

test("the phone sidebar closes after a link opens another page", async () => {
  const { router } = await renderSidebar();
  const sheet = await openSheet();

  await act(async () => {
    fireEvent.click(within(sheet).getByRole("link", { name: "Orders" }));
  });
  await act(async () => {
    flushFrame();
  });

  await expectSheetClosed();
  await screen.findByRole("heading", { name: "Orders" });
  expect(router.state.location.pathname).toBe("/orders");
});

test("the phone sidebar closes after a link to the current page", async () => {
  await renderSidebar();
  const sheet = await openSheet();

  await act(async () => {
    fireEvent.click(within(sheet).getByRole("link", { name: "Dashboard" }));
  });
  await act(async () => {
    flushFrame();
  });

  await expectSheetClosed();
  expect(screen.getByRole("heading", { name: "Dashboard" })).toBeTruthy();
});
