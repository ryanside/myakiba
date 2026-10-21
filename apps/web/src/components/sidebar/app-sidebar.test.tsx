import { afterEach, beforeEach, expect, test } from "bun:test";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { flushFrame, frames, renderSidebar } from "../../../test/sidebar-app";

const realVisibility = Object.getOwnPropertyDescriptor(document, "visibilityState");
let visibilityState: DocumentVisibilityState = "visible";

beforeEach(() => {
  visibilityState = "visible";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibilityState,
  });
});

afterEach(() => {
  if (realVisibility) Object.defineProperty(document, "visibilityState", realVisibility);
  else Reflect.deleteProperty(document, "visibilityState");
});

function menuButton(name: string) {
  const button = screen
    .getByRole("link", { name })
    .closest<HTMLElement>('[data-sidebar="menu-button"]');
  if (!button) throw new Error(`${name} has no menu button`);
  return button;
}

async function expectOrders() {
  await waitFor(() => expect(screen.getByRole("heading", { name: "Orders" })).toBeTruthy(), {
    timeout: 2000,
  });
}

test("every sidebar link is the whole menu button, so its hover area is its hit area", async () => {
  await renderSidebar();

  const links = screen.getAllByRole("link");
  expect(links.length).toBeGreaterThan(0);
  for (const link of links) {
    expect(link.dataset.sidebar, link.textContent ?? "").toBe("menu-button");
    expect(link.closest("button"), link.textContent ?? "").toBeNull();
  }
});

test("a sidebar destination opens on the click without waiting for its code to load", async () => {
  const { ordersImported } = await renderSidebar(Bun.sleep(100));
  await act(async () => {
    const warmed = await Promise.race([
      ordersImported.then(() => "warmed"),
      Bun.sleep(1000).then(() => "not warmed"),
    ]);
    expect(warmed, "the Orders code loads before the click").toBe("warmed");
  });

  await act(async () => {
    fireEvent.click(screen.getByRole("link", { name: "Orders" }));
  });
  await act(async () => {
    flushFrame();
  });
  await act(
    () =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      }),
  );
  expect(screen.getByRole("heading", { name: "Orders" })).toBeTruthy();
  expect(menuButton("Orders").dataset.active).toBeDefined();
});

test("the clicked sidebar item turns active before the page renders", async () => {
  const { router } = await renderSidebar();
  await act(async () => {
    await router.preloadRoute({ to: "/orders" });
  });

  const ordersLink = screen.getByRole("link", { name: "Orders" });
  const ordersButton = menuButton("Orders");
  const dashboardHeading = screen.getByRole("heading", { name: "Dashboard" });
  await act(async () => {
    fireEvent.click(ordersLink);
  });

  expect(ordersButton.dataset.active).toBeDefined();
  expect(router.state.location.pathname).toBe("/orders");
  expect(dashboardHeading.isConnected).toBe(true);
  await act(async () => {
    await Bun.sleep(250);
  });
  expect(ordersButton.dataset.active).toBeDefined();
  expect(router.state.location.pathname).toBe("/orders");
  expect(dashboardHeading.isConnected).toBe(true);

  await act(async () => {
    flushFrame();
  });
  await expectOrders();
});

test("same-page navigations and preloads do not wait for a paint", async () => {
  visibilityState = "hidden";
  const { router } = await renderSidebar();
  visibilityState = "visible";
  await act(async () => {
    const navigation = await Promise.race([
      router.navigate({ to: "/dashboard", search: { tab: "monthly" } }).then(() => "completed"),
      Bun.sleep(500).then(() => "waiting for a paint"),
    ]);
    expect(navigation, "a same-page navigation completes without flushing a frame").toBe(
      "completed",
    );
    const preload = await Promise.race([
      router.preloadRoute({ to: "/orders" }).then(() => "completed"),
      Bun.sleep(500).then(() => "waiting for a paint"),
    ]);
    expect(preload, "a preload completes without flushing a frame").toBe("completed");
  });

  expect(router.state.resolvedLocation?.search).toEqual({ tab: "monthly" });
  expect(screen.getByRole("heading", { name: "Dashboard" })).toBeTruthy();
});

test("a page change finishes if the tab becomes hidden before its frame", async () => {
  const { router } = await renderSidebar();
  await act(async () => {
    await router.preloadRoute({ to: "/orders" });
  });
  const framesBeforeClick = new Set(frames.keys());
  await act(async () => {
    fireEvent.click(screen.getByRole("link", { name: "Orders" }));
  });
  const navigationFrames = [...frames.keys()].filter((handle) => !framesBeforeClick.has(handle));
  expect(navigationFrames.length).toBeGreaterThan(0);
  expect(screen.getByRole("heading", { name: "Dashboard" })).toBeTruthy();

  await act(async () => {
    visibilityState = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expectOrders();
  for (const handle of navigationFrames) expect(frames.has(handle)).toBe(false);
});

test("a page change in an already hidden tab does not wait for a paint", async () => {
  const { router } = await renderSidebar();
  await act(async () => {
    await router.preloadRoute({ to: "/orders" });
    visibilityState = "hidden";
  });
  const framesBeforeClick = new Set(frames.keys());
  await act(async () => {
    fireEvent.click(screen.getByRole("link", { name: "Orders" }));
  });

  await expectOrders();
  expect([...frames.keys()].filter((handle) => !framesBeforeClick.has(handle))).toEqual([]);
});
